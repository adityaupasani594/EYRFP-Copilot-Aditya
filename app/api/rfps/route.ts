import { NextResponse } from 'next/server';
import rfpData from '@/public/rfp_data.json';

export async function GET() {
  try {
    const today = new Date();
    const rfps: any[] = [];
    
    // Process each RFP from static JSON data
    Object.keys(rfpData).forEach((id) => {
      const data = rfpData[id as keyof typeof rfpData];
      const offset = data.due_date_offset_days || 0;
      const dueDate = new Date(today.getTime() + offset * 24 * 60 * 60 * 1000);
      
      rfps.push({
        id,
        title: data.title,
        due_date: dueDate.toISOString().split('T')[0],
        due_date_offset_days: offset,
        scope: data.scope,
        tests: data.tests,
        origin_url: data.origin_url,
        issuing_entity: data.issuing_entity,
        executor: data.executor,
        type: data.type,
      });
    });
    
    return NextResponse.json(rfps);
  } catch (error) {
    console.error('Error parsing RFP source:', error);
    return NextResponse.json({ error: 'Failed to parse RFPs' }, { status: 500 });
  }
}
