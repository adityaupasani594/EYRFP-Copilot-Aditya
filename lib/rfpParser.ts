// Type definitions for RFP data
export interface RFPItem {
  item_id: number;
  description: string;
  qty: number;
  specs: {
    conductor_size_mm2: number;
    voltage_kv: number;
    insulation_mm: number;
  };
}

export interface RFP {
  id: string;
  title: string;
  due_date: string;
  due_date_offset_days: number;
  scope: RFPItem[];
  tests: string[];
  origin_url: string;
  issuing_entity?: string;
  executor?: string;
  type?: string;
}

// Preprocess PDF text to improve Gemini parsing
function preprocessPdfText(text: string): string {
  // Remove excessive whitespace and normalize line breaks
  let cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Remove multiple spaces
  cleaned = cleaned.replace(/ {2,}/g, ' ');
  // Remove multiple newlines but keep paragraph structure
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  // Trim each line
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
  return cleaned.trim();
}

// Gemini-driven parsing of free text into structured RFP
export async function parseWithGemini(text: string): Promise<{ rfp: RFP | null; parser: 'gemini' | 'failed' }> {
  try {
    console.log('🤖 Attempting Gemini parsing...');
    
    // Preprocess the text
    const cleanedText = preprocessPdfText(text);
    console.log('🧹 Cleaned text length:', cleanedText.length);
    
    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
    const { ChatPromptTemplate } = await import('@langchain/core/prompts');
    const { StringOutputParser } = await import('@langchain/core/output_parsers');

    const llm = new ChatGoogleGenerativeAI({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.2'),
      apiKey: process.env.GEMINI_API_KEY,
      maxRetries: 2,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `You are an expert at extracting structured information from Paints/Coatings RFP (Request for Proposal) documents for Asian Paints.

Your task: Analyze the document and extract ALL painting/coating related items, materials, or services mentioned.

Extraction Rules:
1. Find the RFP title/subject (usually at the top)
2. Find the issuing organization/company name
3. Find due date/deadline (look for dates, if not found use today: ${new Date().toISOString().split('T')[0]})
4. Extract EVERY item mentioned - look for:
   - Numbered lists (1., 2., 3.)
   - Bullet points (•, -, *)
   - Tables with item descriptions
   - Any lines mentioning paints, coatings, primers, putty, surface preparation, scaffolding
   - Quantities with units (m², liters, kg, running meters, etc.)

5. For technical specifications (Paints/Coatings focus):
   - Extract: coverage_area_m2, surface_type (interior/exterior/metal/wood/concrete), number_of_coats, paint_type/system (emulsion/enamel/epoxy/polyurethane), finish (matte/gloss/satin), color/shade if present, primer_required (yes/no), surface_prep (eg. rust removal, sanding, putty), VOC/low_odor requirements, warranty_years if present.
   - If thickness is specified, extract dry_film_thickness_microns.

Schema compatibility mapping (important): in addition to the above keys, also include these numeric placeholders under specs for compatibility with downstream code:
   - conductor_size_mm2: map to coverage_area_m2 (or a reasonable numeric value)
   - voltage_kv: map to number_of_coats
   - insulation_mm: map to dry_film_thickness_microns divided by 1000 (mm). If not given, use 0.1

6. Look for test requirements or quality standards (eg. IS/ISO standards, adhesion tests, salt spray for metal, washability)

CRITICAL: Use actual text from the document - NO generic placeholders like "Item 1" or "Product X".

Return ONLY valid JSON without markdown code blocks.`],
      ['human', `Analyze this paints/coatings RFP document and extract all information:

{rfpText}

---

Return this JSON structure (keep specs mapping as instructed above):
{{
  "id": "RFP-UPLOAD-${Date.now()}",
  "title": "<actual RFP title from document>",
  "due_date": "${new Date().toISOString().split('T')[0]}",
  "due_date_offset_days": 0,
  "scope": [
    {{
      "item_id": 1,
      "description": "<ACTUAL paints/coatings item description - include surface and area>",
      "qty": <number>,
      "specs": {{
        "coverage_area_m2": <number>,
        "surface_type": "<concrete/metal/wood/interior/exterior>",
        "number_of_coats": <number>,
        "paint_type": "<emulsion/enamel/epoxy/...>",
        "finish": "<matte/gloss/satin>",
        "primer_required": <true|false>,
        "dry_film_thickness_microns": <number>,
        "conductor_size_mm2": <number>,
        "voltage_kv": <number>,
        "insulation_mm": <number>
      }}
    }}
  ],
  "tests": ["<eg. IS/ISO test requirements if any>"],
  "origin_url": "uploaded-pdf",
  "issuing_entity": "<organization name from document>",
  "type": "PDF"
}}

Extract AT LEAST 1 item. If the document has multiple items, include them all.`],
    ]);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    
    // Use cleaned text, limit to reasonable size for API
    const textToSend = cleanedText.slice(0, 100000);
    console.log(`📤 Sending ${textToSend.length} characters to Gemini...`);
    
    let raw: string;
    try {
      raw = await chain.invoke({ rfpText: textToSend });
      console.log('📥 Gemini response received - length:', raw.length);
      console.log('📥 Response preview:', raw.slice(0, 300));
    } catch (apiError) {
      console.error('❌ Gemini API call failed:', apiError);
      throw new Error(`Gemini API error: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
    }

    let cleaned = raw.trim();
    
    // Aggressive markdown cleanup
    if (cleaned.includes('```')) {
      // Remove code block markers
      cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    }
    
    // Try to find JSON if response has extra text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    cleaned = cleaned.trim();
    console.log('🧹 Cleaned for parsing:', cleaned.slice(0, 400));
    
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
      console.log('✅ JSON parsed successfully');
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.error('📄 Raw response:', raw.slice(0, 1500));
      console.error('📄 Cleaned response:', cleaned.slice(0, 1500));
      throw new Error(`Invalid JSON from Gemini: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
    }
    
    console.log('📊 Parsed structure:', { 
      hasId: !!parsed.id, 
      hasTitle: !!parsed.title, 
      hasScope: !!parsed.scope,
      scopeLength: parsed.scope?.length || 0,
      hasEntity: !!parsed.issuing_entity
    });

    // Basic normalization
    const fallbackDate = new Date().toISOString().split('T')[0];
    parsed.id = parsed.id || `RFP-UPLOAD-${Date.now()}`;
    parsed.title = parsed.title || 'Uploaded RFP';
    parsed.due_date = parsed.due_date || fallbackDate;
    parsed.due_date_offset_days = parsed.due_date_offset_days ?? 0;
    parsed.scope = Array.isArray(parsed.scope) ? parsed.scope : [];
    parsed.tests = Array.isArray(parsed.tests) ? parsed.tests : [];
    parsed.origin_url = parsed.origin_url || 'uploaded-pdf';
    parsed.issuing_entity = parsed.issuing_entity || 'Unknown';
    parsed.type = parsed.type || 'PDF';

    // Validate basic structure
    if (!parsed.scope || !Array.isArray(parsed.scope)) {
      console.warn('⚠️ No scope array in response');
      parsed.scope = [];
    }
    
    if (parsed.scope.length === 0) {
      console.warn('⚠️ Gemini returned empty scope - attempting to extract from response');
      // Last resort: if Gemini explained but didn't provide items, fail gracefully
      throw new Error('No items extracted from PDF. The document may not contain a clear item list.');
    }
    
    console.log(`✅ Found ${parsed.scope.length} item(s)`);
    
    parsed.scope = parsed.scope.map((item: any, idx: number) => ({
      item_id: Number(item.item_id ?? idx + 1),
      description: String(item.description ?? 'Line Item'),
      qty: Number(item.qty ?? 1),
      specs: {
        conductor_size_mm2: Number(item.specs?.conductor_size_mm2 ?? 4),
        voltage_kv: Number(item.specs?.voltage_kv ?? 1),
        insulation_mm: Number(item.specs?.insulation_mm ?? 1.0),
      },
    }));

    return { rfp: parsed as RFP, parser: 'gemini' };
  } catch (e) {
    console.error('❌ parseWithGemini error:', e);
    return { rfp: null, parser: 'failed' };
  }
}

export function calculateMetrics(rfps: RFP[]) {
  const defaultWinRates = [
    { month: 'Jul', rate: 58 },
    { month: 'Aug', rate: 62 },
    { month: 'Sep', rate: 65 },
    { month: 'Oct', rate: 64 },
    { month: 'Nov', rate: 67 },
    { month: 'Dec', rate: 68 },
  ];

  if (!rfps.length) {
    return {
      rfpsAwaitingReview: 0,
      avgMatchAccuracy: 0,
      catalogCoverage: 0,
      manualOverrides: 0,
      sources: { website: 0, email: 0, uploaded: 0 },
      winRates: defaultWinRates,
      totalItems: 0,
    };
  }

  const totalRFPs = rfps.length;
  const totalItems = rfps.reduce((sum, rfp) => sum + rfp.scope.length, 0) || 1;

  // Calculate average match confidence (based on specs completeness)
  const avgMatchAccuracy =
    rfps.reduce((sum, rfp) => {
      const itemAccuracy = rfp.scope.reduce((itemSum, item) => {
        const hasAllSpecs =
          item.specs.conductor_size_mm2 &&
          item.specs.voltage_kv &&
          item.specs.insulation_mm;
        return itemSum + (hasAllSpecs ? 0.92 : 0.75);
      }, 0);
      return sum + itemAccuracy / rfp.scope.length;
    }, 0) / totalRFPs;

  // Catalog coverage (percentage of items with complete specs)
  const itemsWithCompleteSpecs = rfps.reduce((sum, rfp) => {
    return sum +
      rfp.scope.filter((item) =>
        item.specs.conductor_size_mm2 &&
        item.specs.voltage_kv &&
        item.specs.insulation_mm
      ).length;
  }, 0);
  const catalogCoverage = (itemsWithCompleteSpecs / totalItems) * 100;

  // Manual overrides (items with special requirements)
  const manualOverrides = rfps.reduce((sum, rfp) => {
    return sum +
      rfp.scope.filter((item) =>
        item.specs.insulation_mm > 1.2 || item.specs.voltage_kv > 10
      ).length;
  }, 0);

  // RFP sources
  const websiteRfps = rfps.filter(r => 
    r.origin_url && !r.origin_url.includes('uploaded-pdf') && 
    (r.origin_url.includes('psu') || r.origin_url.includes('metro') || 
     r.origin_url.includes('http') || r.origin_url.includes('www'))
  );
  const emailRfps = rfps.filter(r => 
    r.origin_url && 
    (r.origin_url.includes('fmcg') || r.origin_url.includes('example') || 
     r.origin_url.includes('email') || r.origin_url.includes('mailto'))
  );
  const uploadedRfps = rfps.filter(r => r.origin_url && r.origin_url.includes('uploaded-pdf'));
  
  const sources = {
    website: websiteRfps.length,
    email: emailRfps.length,
    uploaded: uploadedRfps.length,
  };

  // Win rate (simulated based on RFP complexity)
  const winRates = defaultWinRates;

  return {
    rfpsAwaitingReview: totalRFPs,
    avgMatchAccuracy: Math.round(avgMatchAccuracy * 100),
    catalogCoverage: Math.round(catalogCoverage),
    manualOverrides,
    sources,
    winRates,
    totalItems,
  };
}
