import { visit } from 'unist-util-visit';
import { toString } from 'hast-util-to-string';

export default function rehypeTocTarget() {
  return (tree) => {
    // Find the h2 with text "Contents" and get the ol that follows it
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName === 'h2') {
        const text = toString(node).toLowerCase().trim();
        if (text === 'contents') {
          // Find the next element sibling (skip text nodes)
          if (parent?.children) {
            for (let i = index + 1; i < parent.children.length; i++) {
              const sibling = parent.children[i];
              if (sibling.type === 'element') {
                if (sibling.tagName === 'ol') {
                  addTargetToLinks(sibling);
                }
                break;
              }
            }
          }
        }
      }
    });
  };
}

function addTargetToLinks(node) {
  if (node.tagName === 'a' && node.properties?.href?.startsWith('#')) {
    node.properties.target = '_parent';
  }
  if (node.children) {
    for (const child of node.children) {
      if (typeof child === 'object') {
        addTargetToLinks(child);
      }
    }
  }
}
