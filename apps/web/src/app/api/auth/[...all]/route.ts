import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth";

const handler = (request: Request) => toNextJsHandler(getAuth()).GET(request);
const postHandler = (request: Request) => toNextJsHandler(getAuth()).POST(request);

export { handler as GET, postHandler as POST };
