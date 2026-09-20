import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processDocumentOcr } from '@/lib/services/ocr';
import { DocumentUploadSchema } from '@/types';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get('patientId');
  return NextResponse.json(db.getDocuments(patientId || undefined));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = DocumentUploadSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors.map((e) => e.message).join(', ') },
        { status: 400 }
      );
    }

    const { patientId, title, fileType, preset } = parseResult.data;
    const targetPatientId = patientId || 'pat-1';

    // Run OCR Candidate Extraction
    const ocrResult = await processDocumentOcr(title, fileType, preset);

    const doc = db.createDocument({
      patientId: targetPatientId,
      title,
      fileType,
      isReadable: ocrResult.isReadable,
      rawTextPreview: ocrResult.rawTextPreview,
      candidateExtraction: ocrResult.candidateExtraction,
      verificationStatus: 'NEEDS_VERIFICATION',
    });

    return NextResponse.json({
      success: true,
      document: doc,
      ocrResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
