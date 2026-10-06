import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';

const execFileAsync = promisify(execFile);

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const clinicId = formData.get('clinic_id');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (typeof clinicId !== 'string' || !clinicId.trim()) {
      return NextResponse.json({ error: 'clinic_id is required.' }, { status: 400 });
    }

    const auth = await authorizeClinicRequest(request, clinicId);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
    }

    const tempPath = `/tmp/ai-analysis-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.png';
    const imagePath = `${tempPath}${extension}`;
    await import('node:fs/promises').then(({ writeFile }) => writeFile(imagePath, bytes));

    const { stdout, stderr } = await execFileAsync('python3', ['ai-engine/analyzer.py', imagePath], {
      cwd: process.cwd(),
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const json = JSON.parse(stdout);
    if (json.status === 'error') {
      return NextResponse.json({ error: json.message ?? 'Analysis failed.' }, { status: 500 });
    }

    if (stderr && json.status === 'unavailable') {
      console.warn('[ai-analysis] local engine unavailable:', stderr.trim());
    }

    return NextResponse.json({ data: json });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown analysis error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
