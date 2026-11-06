'use strict';

(() => {
  const copyButton = document.getElementById('copy-bibtex');
  const bibtexBlock = document.getElementById('bibtex');
  const copyStatus = document.getElementById('copy-bibtex-status');
  if (!copyButton || !bibtexBlock || !copyStatus) return;
  let resetTimer;
  copyButton.addEventListener('click', async () => {
    clearTimeout(resetTimer);
    const bibtexText = bibtexBlock.textContent.trim();
    let copied = false;
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(bibtexText);
        copied = true;
      } catch {}
    }
    if (!copied) {
      const clipboardField = document.createElement('textarea');
      clipboardField.value = bibtexText;
      clipboardField.readOnly = true;
      clipboardField.setAttribute('aria-label', 'BibTeX to copy');
      clipboardField.style.cssText =
        'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.append(clipboardField);
      try {
        clipboardField.focus({
          preventScroll: true,
        });
        clipboardField.select();
        copied = document.execCommand('copy');
      } catch {}
      clipboardField.remove();
      copyButton.focus({
        preventScroll: true,
      });
    }
    copyButton.textContent = copied ? 'Copied!' : 'Select & copy';
    if (copied) copyStatus.textContent = 'BibTeX copied.';
    else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(bibtexBlock);
      bibtexBlock.focus({
        preventScroll: true,
      });
      selection.removeAllRanges();
      selection.addRange(range);
      copyStatus.textContent = 'Text selected. Press Ctrl+C or ⌘C to copy.';
    }
    resetTimer = setTimeout(() => {
      copyButton.textContent = 'Copy BibTeX';
      copyStatus.textContent = '';
    }, 4000);
  });
})();
