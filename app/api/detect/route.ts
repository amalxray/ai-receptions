import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image');

    if (!imageFile || typeof imageFile === 'string') {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const apiKey = process.env.ROBOFLOW_API_KEY;
    const workspace = process.env.ROBOFLOW_WORKSPACE || 'shadi-ai';
    const model = process.env.ROBOFLOW_MODEL || 'yolov8n-dental-v1';

    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing in .env' }, { status: 500 });
    }

    const bytes = await imageFile.arrayBuffer();
    const base64Image = Buffer.from(bytes).toString('base64');

    const modelUrl = `https://detect.roboflow.com/${workspace}/${model}`;
    const url = new URL(modelUrl);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('confidence', '0.25');
    url.searchParams.set('overlap', '0.5');
    console.log('📡 Attempting Roboflow URL:', modelUrl);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: base64Image,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Roboflow API Error:', response.status, errorText);
      return NextResponse.json(
        { error: `Roboflow error: ${response.status}`, details: errorText },
        { status: response.status },
      );
    }

    const result = await response.json();
    console.log('✅ Roboflow Success! Found predictions:', result.predictions?.length || 0);

    return NextResponse.json({ success: true, predictions: result.predictions || [] });
  } catch (error) {
    console.error('💥 Route Processing Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process image',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    );
  }
}
