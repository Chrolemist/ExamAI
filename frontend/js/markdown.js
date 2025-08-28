// Minimal Markdown to HTML converter (safe-ish) for classic usage
// Responsibility: Konvertera markdown till sanerad HTML för paneler/sektioner.
// Supports: headings (#..######), bold **text**, italics *text*, inline code `code`,
// code fences ```lang\n...\n```, unordered lists (-, *), and paragraphs. Escapes HTML first.
// SOLID hints:
// - S: Endast text->HTML; ingen DOM-append här.
// - O: Lägg fler regler via nya regex-steg utan att röra existerande.
// - I: Håll API litet: mdToHtml/escapeHtml.
(function(){
  function escapeHtml(s){
    return String(s||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/\"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function mdToHtml(md){
    try{
      let text = String(md||'');
      // Normalize newlines
      text = text.replace(/\r\n?/g, '\n');
      // Extract fenced code blocks first
      const blocks = [];
      text = text.replace(/```([a-z0-9_-]+)?\n([\s\S]*?)```/gi, (m, lang, code)=>{
        const idx = blocks.length;
        blocks.push({ lang: (lang||'').toLowerCase(), code });
        return `@@CODEBLOCK_${idx}@@`;
      });
      // Escape residual HTML
      text = escapeHtml(text);
      // Headings
      text = text.replace(/^######\s*(.*)$/gm, '<h6>$1<\/h6>')
                 .replace(/^#####\s*(.*)$/gm, '<h5>$1<\/h5>')
                 .replace(/^####\s*(.*)$/gm, '<h4>$1<\/h4>')
                 .replace(/^###\s*(.*)$/gm, '<h3>$1<\/h3>')
                 .replace(/^##\s*(.*)$/gm, '<h2>$1<\/h2>')
                 .replace(/^#\s*(.*)$/gm, '<h1>$1<\/h1>');
      // Lists: group consecutive list items into <ul>
      text = text.replace(/^(?:\s*[-*]\s+.+(?:\n|$))+?/gm, (m)=>{
        const items = m.trim().split(/\n/).map(l=>l.replace(/^\s*[-*]\s+/, '').trim());
        return '<ul>' + items.map(i=>`<li>${i}<\/li>`).join('') + '<\/ul>';
      });
      // Inline code, bold, italics
      text = text
        .replace(/`([^`]+)`/g, '<code>$1<\/code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1<\/strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1<\/em>');
      // Paragraphs: wrap loose lines that are not already block elements
      const lines = text.split(/\n\n+/).map(chunk=>{
        const t = chunk.trim();
        if (!t) return '';
        if (/^<h\d|^<ul>|^<pre>|^<p>|^<blockquote>/.test(t)) return t;
        // Single newlines -> <br>
        const inl = t.replace(/\n/g,'<br>');
        return '<p>' + inl + '<\/p>';
      });
      let html = lines.join('\n');
      // Put back code blocks
      html = html.replace(/@@CODEBLOCK_(\d+)@@/g, (m, i)=>{
        const b = blocks[Number(i)];
        const code = escapeHtml(b.code);
        const cls = b.lang ? ` class=\"lang-${b.lang}\"` : '';
        return `<pre><code${cls}>${code}<\/code><\/pre>`;
      });
      return html;
    }catch(e){ return escapeHtml(md||''); }
  }
  window.escapeHtml = window.escapeHtml || escapeHtml;
  window.mdToHtml = window.mdToHtml || mdToHtml;
})();
