import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * FEAT-privacy: AI 엔드포인트 직접 호출 금지.
 *
 * 모든 AI 외부 호출은 `useAIGate.send()`를 거쳐야 하므로,
 * `fetch("/api/ai/...")` 또는 `axios.X("/api/ai/...")` 직접 호출을 막는다.
 *
 * 단 useAIGate 자체와 가까운 인접 모듈(future FEAT-ai-pipeline)은 화이트리스트로 빼낼 수 있다.
 */
const aiFetchSelector = `CallExpression[callee.name='fetch'][arguments.0.type='Literal'][arguments.0.value=/^\\/api\\/ai\\//]`;
const aiAxiosSelector = `CallExpression[callee.object.name='axios'][arguments.0.type='Literal'][arguments.0.value=/^\\/api\\/ai\\//]`;

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: aiFetchSelector,
          message:
            "AI 엔드포인트 직접 호출 금지. useAIGate().send()를 통하라 (FEAT-privacy).",
        },
        {
          selector: aiAxiosSelector,
          message:
            "AI 엔드포인트 직접 호출 금지. useAIGate().send()를 통하라 (FEAT-privacy).",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
