// pages.dev の本番 URL をカスタムドメインへ 301 リダイレクトする。
// プレビュー(<hash>.mytodo-cnt.pages.dev)は完全一致しないので対象外。
const PAGES_HOST = 'mytodo-cnt.pages.dev'
const CANONICAL_HOST = 'todo.tadashi0713.dev'

export const onRequest: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url)
  if (url.hostname === PAGES_HOST) {
    url.hostname = CANONICAL_HOST
    return Response.redirect(url.toString(), 301)
  }
  return ctx.next()
}
