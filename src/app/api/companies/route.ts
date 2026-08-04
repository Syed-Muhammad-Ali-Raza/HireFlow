import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Insert new company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: name.trim() })
      .select()
      .single();

    if (companyError || !company) {
      console.error('Company creation error:', companyError);
      return NextResponse.json({ error: companyError?.message || 'Failed to create company' }, { status: 500 });
    }

    // 3. Update current profile with the company_id and set role as admin
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ company_id: company.id, role: 'admin' })
      .eq('id', user.id);

    if (profileError) {
      console.error('Profile update error:', profileError);
      // Attempt to clean up company if profile linking failed
      await supabase.from('companies').delete().eq('id', company.id);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json(company, { status: 201 });
  } catch (error: any) {
    console.error('Companies route error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// GET: Fetch current user's company info
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.company_id) {
      return NextResponse.json({ company: null });
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', profile.company_id)
      .single();

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 500 });
    }

    return NextResponse.json({ company });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
