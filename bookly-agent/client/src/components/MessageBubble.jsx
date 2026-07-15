function ToolBadge({ call }) {
  const label = {
    lookup_order: 'Looked up order',
    initiate_return: 'Processed return',
    search_policies: 'Searched policies',
  }[call.name] || call.name;

  return (
    <div className="tool-badge" title={JSON.stringify(call.input)}>
      🔧 {label}
    </div>
  );
}

// Renders markdown links ([label](url)) as citations so policy-answer
// grounding (search_policies' source url) is visible, not raw bracket syntax.
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderText(text) {
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = LINK_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <a key={key++} href={match[2]} target="_blank" rel="noopener noreferrer" className="citation-link">
        {match[1]}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export default function MessageBubble({ role, text, toolCalls }) {
  return (
    <div className={`bubble-row ${role}`}>
      <div className="bubble">
        {toolCalls && toolCalls.length > 0 && (
          <div className="tool-badges">
            {toolCalls.map((call, i) => (
              <ToolBadge key={i} call={call} />
            ))}
          </div>
        )}
        <div className="bubble-text">{renderText(text)}</div>
      </div>
    </div>
  );
}
