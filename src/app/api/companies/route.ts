import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (existingProfile?.company_id) {
      return NextResponse.json({ error: 'You already belong to a company.' }, { status: 400 });
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: name.trim() })
      .select()
      .single();

    if (companyError || !company) {
      console.error('Company creation error:', companyError);
      return NextResponse.json(
        { error: companyError?.message || 'Failed to create company' },
        { status: 500 }
      );
    }

    // Service role bypasses the privileged-field trigger (role + company_id)
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ company_id: company.id, role: 'admin' })
      .eq('id', user.id);

    if (profileError) {
      console.error('Profile update error:', profileError);
      await supabaseAdmin.from('companies').delete().eq('id', company.id);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json(company, { status: 201 });
  } catch (error: unknown) {
    console.error('Companies route error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
