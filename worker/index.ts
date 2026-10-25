import handler from "vinext/server/fetch-handler";
// Deploy only behind the private Sites authentication gateway. A raw public Worker
// does not validate Sites identity headers and is not a supported deployment.
export default { fetch(request:Request, env:Cloudflare.Env, ctx:ExecutionContext) {
 return handler.fetch(request,env,ctx);
}};
