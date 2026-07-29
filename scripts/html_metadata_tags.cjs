"use strict";

const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);
const STRUCTURAL_METADATA_ATTRIBUTES = new Set(["name", "property", "rel"]);

function findTagEnd(html, startIndex) {
  let quote = "";
  for (let index = startIndex; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return -1;
}

function scanHtmlStartTags(html, acceptedTagNames) {
  const accepted = new Set(acceptedTagNames.map((name) => String(name).toLowerCase()));
  const tags = [];
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start < 0) break;

    if (html.startsWith("<!--", start)) {
      const commentEnd = html.indexOf("-->", start + 4);
      cursor = commentEnd < 0 ? html.length : commentEnd + 3;
      continue;
    }

    const nameMatch = /^<([A-Za-z][^\t\n\f\r />]*)/.exec(html.slice(start));
    if (!nameMatch) {
      const declarationEnd = findTagEnd(html, start + 1);
      cursor = declarationEnd < 0 ? start + 1 : declarationEnd + 1;
      continue;
    }

    const tagName = nameMatch[1].toLowerCase();
    const end = findTagEnd(html, start + nameMatch[0].length);
    if (end < 0) break;
    if (accepted.has(tagName)) tags.push(html.slice(start, end + 1));
    cursor = end + 1;

    if (RAW_TEXT_ELEMENTS.has(tagName)) {
      const closingTag = new RegExp(`</${tagName}(?=[\\t\\n\\f\\r />])`, "ig");
      closingTag.lastIndex = cursor;
      const closingMatch = closingTag.exec(html);
      if (!closingMatch) {
        cursor = html.length;
      } else {
        const closingEnd = findTagEnd(html, closingTag.lastIndex);
        cursor = closingEnd < 0 ? html.length : closingEnd + 1;
      }
    }
  }

  return tags;
}

function decodeAttributeValue(value) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);?/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&(amp|apos|gt|lt|quot);/gi, (_, name) => ({
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"'
    })[name.toLowerCase()]);
}

function parseHtmlAttributes(tag) {
  const values = Object.create(null);
  const duplicateNames = [];
  const structuralCharacterReferenceNames = [];

  for (const match of tag.matchAll(/\b([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    const name = match[1].toLowerCase();
    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
    if (Object.hasOwn(values, name)) {
      duplicateNames.push(name);
      continue;
    }
    values[name] = decodeAttributeValue(rawValue);
    if (STRUCTURAL_METADATA_ATTRIBUTES.has(name) && rawValue.includes("&")) {
      structuralCharacterReferenceNames.push(name);
    }
  }

  return {
    values,
    duplicateNames: [...new Set(duplicateNames)],
    structuralCharacterReferenceNames: [...new Set(structuralCharacterReferenceNames)]
  };
}

module.exports = {
  parseHtmlAttributes,
  scanHtmlStartTags
};
