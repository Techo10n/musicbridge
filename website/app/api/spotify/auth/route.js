export async function POST(req) {
    const { code, verifier } = await req.json(); // Ensure verifier is extracted from the request

    const params = new URLSearchParams();
    params.append("client_id", "cb9e6121711242898b38500c88a7fcd9");
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:3000/");
    params.append("code_verifier", verifier); // Pass verifier from the request

    const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
    });

    if (!response.ok) {
        console.error("Failed to fetch access token:", await response.text());
        return new Response(JSON.stringify({ error: "Failed to fetch access token" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const { access_token } = await response.json();

    return new Response(JSON.stringify({ accessToken: access_token }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}