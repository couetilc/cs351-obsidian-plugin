import { visit } from 'unist-util-visit';

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'pre', 'ul', 'ol', 'li', 'blockquote',
  'table', 'div', 'hr', 'details', 'section',
]);

export default function rehypeSourceLine() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (
        BLOCK_TAGS.has(node.tagName) &&
        node.position?.start?.line != null
      ) {
        if (!node.properties) node.properties = {};
        node.properties['dataSourceLine'] = node.position.start.line;
      }
    });
  };
}
