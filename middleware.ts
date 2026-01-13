import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD || "";
  const url = req.nextUrl;

  // libera essas rotas/arquivos sem senha
  const isPublic =
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/api/login") ||
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/favicon.ico") ||
    url.pathname.startsWith("/logo.jpg") || // se seu arquivo tiver outro nome, troque aqui
    url.pathname.startsWith("/public");

  if (isPublic) return NextResponse.next();

  // se não setou a senha no env, não bloqueia (pra dev não travar)
  if (!password) return NextResponse.next();

  const auth = req.cookies.get("auth")?.value;
  if (auth === "ok") return NextResponse.next();

  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
