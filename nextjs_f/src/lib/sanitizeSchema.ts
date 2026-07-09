import { defaultSchema, type Options as Schema } from "rehype-sanitize";

const wildcardAttributes = defaultSchema.attributes?.["*"] ?? [];

/**
 * rehype-sanitizeの既定スキーマ（GitHubのMarkdownサニタイズ準拠）をベースに、
 * style・className属性をすべての要素で許可する（page-break指定やKaTeXの内部表現に必要なため）。
 * <script>・イベントハンドラ属性（on*）・javascript:スキーム等は既定スキーマのまま除去される。
 */
export const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...wildcardAttributes, "style", "className"],
  },
};
