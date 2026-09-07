import { terminalGuideMeta, terminalGuideSections } from '../content/terminalGuide'

export default function TerminalGuide() {
  return (
    <div className="terminal-guide">
      <header className="terminal-guide-hero">
        <span>{terminalGuideMeta.version}</span>
        <h2>{terminalGuideMeta.title}</h2>
        <p>{terminalGuideMeta.subtitle}</p>
        <small>作者：{terminalGuideMeta.author}</small>
        <small>更新日期：{terminalGuideMeta.updatedAt}</small>
      </header>

      <div className="terminal-guide-list">
        {terminalGuideSections.map(section => (
          <section className="terminal-guide-section" key={section.title}>
            <h3>{section.title}</h3>
            {section.body && <p>{section.body}</p>}
            {section.items && (
              <ul>
                {section.items.map(item => <li key={item}>{item}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
