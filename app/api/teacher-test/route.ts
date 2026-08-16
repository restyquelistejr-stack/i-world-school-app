export async function GET() {
  return new Response(
    JSON.stringify({ message: 'Test API is working!' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return new Response(
      JSON.stringify({ 
        message: 'POST received!', 
        data: body 
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}