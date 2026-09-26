export async function resolve(spec, ctx, next) {
  if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[a-jl-z]+$/i.test(spec)) {
    try { return await next(spec + ".js", ctx); } catch {}
  }
  return next(spec, ctx);
}
