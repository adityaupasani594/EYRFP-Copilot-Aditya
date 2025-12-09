import { NextResponse } from 'next/server';
import { mainAgent } from '@/lib/langchain-agents';
import rfpDataSource from '@/public/rfp_data.json';
import { type RFP } from '@/lib/rfpParser';

export async function POST(request: Request) {
  try {
    const { rfpId } = await request.json();
    
    if (!rfpId) {
      return NextResponse.json({ error: 'RFP ID is required' }, { status: 400 });
    }

    // Check if Gemini API key is configured
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return NextResponse.json({ 
        error: 'Gemini API key not configured. Please set GEMINI_API_KEY in .env.local',
        configured: false,
      }, { status: 503 });
    }

    // Get RFP data from static JSON
    const today = new Date();
    const rfps: RFP[] = [];
    
    // Process each RFP from static JSON data
    Object.keys(rfpDataSource).forEach((id) => {
      const data = rfpDataSource[id as keyof typeof rfpDataSource];
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
    
    const rfp = rfps.find(r => r.id === rfpId);
    
    if (!rfp) {
      return NextResponse.json({ error: 'RFP not found' }, { status: 404 });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Processing RFP: ${rfp.id}`);
    console.log(`Title: ${rfp.title}`);
    console.log(`${'='.repeat(60)}\n`);

    // Process with LangChain agents
    const startTime = Date.now();
    const result = await mainAgent.processRFP(rfp);
    const processingTime = Date.now() - startTime;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Processing Complete (${processingTime}ms)`);
    console.log(`Decision: ${result.decision}`);
    console.log(`${'='.repeat(60)}\n`);

    return NextResponse.json({
      success: true,
      rfpId,
      rfpTitle: rfp.title,
      processingTime,
      result,
    });
  } catch (error) {
    console.error('Error processing RFP:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process RFP',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check agent status
export async function GET() {
  const configured = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  
  return NextResponse.json({
    status: 'online',
    configured,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest',
    temperature: process.env.GEMINI_TEMPERATURE || '0.7',
    agents: [
      {
        name: 'Sales Agent',
        status: 'ready',
        description: 'RFP qualification and prioritization',
      },
      {
        name: 'Tech Agent',
        status: 'ready',
        description: 'Specification matching and product recommendation',
      },
      {
        name: 'Pricing Agent',
        status: 'ready',
        description: 'Cost calculation and competitive pricing',
      },
      {
        name: 'Main Agent',
        status: 'ready',
        description: 'Workflow orchestration and final decision',
      },
    ],
    message: configured 
      ? 'All agents ready' 
      : 'Gemini API key not configured. Set GEMINI_API_KEY in .env.local',
  });
}
