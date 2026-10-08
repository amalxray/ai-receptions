import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;

    if (!imageFile) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      );
    }

    // تحويل الملف إلى base64
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');

    // استدعاء Roboflow API
    const response = await fetch(
      `${process.env.ROBOFLOW_API_URL}/${process.env.ROBOFLOW_WORKSPACE}/${process.env.ROBOFLOW_MODEL}/1`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.ROBOFLOW_API_KEY || '',
        },
        body: JSON.stringify({
          image: base64Image,
          confidence: 0.25, // خفضنا العتبة لـ 25%
          overlap: 0.5,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Roboflow API error: ${response.statusText}`);
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      predictions: result.predictions || [],
    });
  } catch (error) {
    console.error('Detection error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to detect objects',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}