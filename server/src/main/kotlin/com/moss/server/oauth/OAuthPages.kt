package com.moss.server.oauth

/** 로그인과 동의를 한 화면에 담은 서버 렌더링 페이지. 스크립트 없이 폼 두 개짜리다. */
object OAuthPages {

    private fun esc(s: String): String = buildString {
        for (c in s) when (c) {
            '&' -> append("&amp;")
            '<' -> append("&lt;")
            '>' -> append("&gt;")
            '"' -> append("&quot;")
            '\'' -> append("&#39;")
            else -> append(c)
        }
    }

    private const val STYLE = """
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f4;margin:0;color:#1c1917}
main{max-width:380px;margin:8vh auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 1px 8px rgba(0,0,0,.08)}
h1{font-size:19px;margin:0 0 6px}p{font-size:14px;line-height:1.5;margin:6px 0;color:#44403c}
.dest{font-size:12px;color:#78716c;word-break:break-all}
label{display:block;font-size:13px;margin:14px 0 4px}
input[type=email],input[type=password]{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d6d3d1;border-radius:8px;font-size:15px}
.row{display:flex;gap:8px;margin-top:20px}
button{flex:1;padding:11px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;font-size:15px;cursor:pointer}
button.ok{background:#1c1917;color:#fff;border-color:#1c1917}
.err{color:#b91c1c;font-size:13px;margin-top:10px}
"""

    private fun shell(title: String, body: String): String =
        "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
            "<title>${esc(title)}</title><style>$STYLE</style></head><body><main>$body</main></body></html>"

    /** 클라이언트나 redirect_uri를 믿을 수 없을 때. 어디로도 돌려보내지 않는다. */
    fun errorPage(message: String): String =
        shell("moss 연결", "<h1>연결할 수 없어요</h1><p>${esc(message)}</p>")

    fun consentPage(
        client: ResolvedClient,
        redirectUri: String,
        hidden: Map<String, String>,
        email: String,
        error: String?,
    ): String {
        val fields = hidden.entries.joinToString("") {
            "<input type=\"hidden\" name=\"${esc(it.key)}\" value=\"${esc(it.value)}\">"
        }
        val errorHtml = error?.let { "<div class=\"err\" role=\"alert\">${esc(it)}</div>" } ?: ""
        return shell(
            "moss 연결",
            """
            <h1>${esc(client.name)}에 연결할까요?</h1>
            <p>이 앱이 내 moss 보드의 메모를 읽고 쓰고 지울 수 있어요. 내가 접근할 수 있는 보드 안에서만 동작해요.</p>
            <p class="dest">승인하면 ${esc(redirectUri)} 로 돌아가요.</p>
            <form method="post" action="/oauth/authorize">
              $fields
              <label for="email">메일</label>
              <input id="email" type="email" name="email" value="${esc(email)}" autocomplete="username">
              <label for="password">비밀번호</label>
              <input id="password" type="password" name="password" autocomplete="current-password">
              $errorHtml
              <div class="row">
                <button type="submit" name="decision" value="deny" formnovalidate>거부</button>
                <button class="ok" type="submit" name="decision" value="approve">로그인하고 허용</button>
              </div>
            </form>
            """.trimIndent(),
        )
    }
}
