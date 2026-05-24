import { escapeSqliteLiteral } from './sql.js';

export const OUTGOING_REF_DISPLAY_LIMIT = 10;
export const SOURCE_PREVIEW_LIMIT = 48;
export const REF_TEXT_PREVIEW_LIMIT = 64;

export type RedirectReason =
    | 'container-first-block'
    | 'heading-first-block'
    | 'doc-first-block';

export interface OutgoingRefRow {
    sourceBlockId: string;
    sourceType: string;
    sourceSubtype?: string;
    sourceContent?: string;
    sourceMarkdown?: string;
    targetBlockId: string;
    targetRootId: string;
    refText?: string;
    markdown?: string;
}

export interface BacklinkRow extends OutgoingRefRow {
    sourceRootId: string;
    sourceBox: string;
    sourcePath: string;
    sourceHpath: string;
    sourceUpdated: string;
}

export interface BlockTreeInfo {
    id?: string;
    type?: string;
    parentID?: string;
    parentType?: string;
    previousID?: string;
    previousType?: string;
}

export interface RedirectTarget {
    id: string;
    type?: string;
    reason?: RedirectReason;
}

const CONTAINER_PARENT_TYPES: Record<string, string> = {
    NodeBlockquote: 'b',
    NodeListItem: 'i',
    NodeSuperBlock: 's'
};

function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

export function previewText(value: string | undefined, maxChars: number): string {
    const flat = decodeHtmlEntities(value ?? '').replace(/\s+/g, ' ').trim();
    if (flat.length <= maxChars) return flat;
    return flat.slice(0, Math.max(0, maxChars - 1)) + '…';
}

export function blockTypeLabel(type: string | undefined, subtype?: string): string {
    if (!type) return '?';
    return subtype ? `${type}/${subtype}` : type;
}

export function buildOutgoingRefsSql(docId: string): string {
    const escapedDocId = escapeSqliteLiteral(docId);
    return `SELECT
  R.block_id AS sourceBlockId,
  B.type AS sourceType,
  B.subtype AS sourceSubtype,
  B.content AS sourceContent,
  B.markdown AS sourceMarkdown,
  R.def_block_id AS targetBlockId,
  R.def_block_root_id AS targetRootId,
  R.content AS refText,
  R.markdown AS markdown
FROM refs AS R
LEFT JOIN blocks AS B ON B.id = R.block_id
WHERE R.root_id = '${escapedDocId}'
ORDER BY B.rowid ASC`;
}

export function buildBacklinksSql(id: string, limit: number): string {
    const escapedId = escapeSqliteLiteral(id);
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 64;
    return `SELECT
  R.block_id AS sourceBlockId,
  R.root_id AS sourceRootId,
  R.box AS sourceBox,
  R.path AS sourcePath,
  SB.hpath AS sourceHpath,
  SB.type AS sourceType,
  SB.subtype AS sourceSubtype,
  SB.content AS sourceContent,
  SB.markdown AS sourceMarkdown,
  SB.updated AS sourceUpdated,
  R.def_block_id AS targetBlockId,
  R.def_block_root_id AS targetRootId,
  R.content AS refText,
  R.markdown AS markdown
FROM refs AS R
LEFT JOIN blocks AS SB ON SB.id = R.block_id
WHERE R.def_block_id = '${escapedId}'
ORDER BY SB.updated DESC
LIMIT ${safeLimit}`;
}

export function buildBlocksByIdsSql(ids: string[]): string {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return 'SELECT id, type, subtype, content, markdown FROM blocks WHERE 1=0';
    const escaped = unique.map((id) => `'${escapeSqliteLiteral(id)}'`).join(', ');
    return `SELECT id, type, subtype, content, markdown FROM blocks WHERE id IN (${escaped})`;
}

export function resolveFirstBlockRedirect(sourceBlockId: string, info: BlockTreeInfo | undefined): RedirectTarget {
    if (!info || info.type !== 'NodeParagraph') return { id: sourceBlockId };

    if (info.previousID === '' && info.parentType && CONTAINER_PARENT_TYPES[info.parentType] && info.parentID) {
        return {
            id: info.parentID,
            type: CONTAINER_PARENT_TYPES[info.parentType],
            reason: 'container-first-block'
        };
    }

    if (info.previousType === 'NodeHeading' && info.previousID) {
        return { id: info.previousID, type: 'h', reason: 'heading-first-block' };
    }

    if (info.previousID === '' && info.parentType === 'NodeDocument' && info.parentID) {
        return { id: info.parentID, type: 'd', reason: 'doc-first-block' };
    }

    return { id: sourceBlockId };
}
