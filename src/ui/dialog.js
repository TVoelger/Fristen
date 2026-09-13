// The list remains mounted while the native dialog manages focus and makes the
// background inert. Only the content of this one window changes during editing.
export function createDialog(root, onDismiss) {
  const dialog = root.querySelector('#ff-dialog');
  const heading = root.querySelector('#ff-dialog-heading');
  const body = root.querySelector('.ff-dialog-body');
  const content = root.querySelector('#ff-dialog-content');
  const html = root.ownerDocument.documentElement;
  const focusHistory = new Map();
  let returnFocus = null;
  let returnSelector = '';
  let returnScroll = { x: 0, y: 0 };
  let currentKey = '';
  let currentMarkup = '';
  let pointerStartedOutside = false;

  function focusSelector(element) {
    if (!element) return '';
    if (element.id) return '#' + CSS.escape(element.id);
    for (const name of ['data-open', 'data-project-open', 'data-project-create', 'data-new', 'data-edit', 'data-subscribe', 'data-cancel', 'data-preliminary-done']) {
      if (element.hasAttribute(name)) return '[' + name + '="' + CSS.escape(element.getAttribute(name)) + '"]';
    }
    return '';
  }
  function outside(event) {
    if (event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  dialog.addEventListener('pointerdown', event => { pointerStartedOutside = outside(event); });
  dialog.addEventListener('click', event => {
    if (pointerStartedOutside && outside(event)) onDismiss();
    pointerStartedOutside = false;
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); onDismiss(); });
  root.querySelector('[data-dialog-close]').addEventListener('click', onDismiss);

  return {
    element: dialog,
    notice: root.querySelector('#ff-dialog-notice'),
    update(markup, key) {
      if (!markup) {
        if (!dialog.open) return;
        dialog.close();
        html.classList.remove('ff-dialog-open');
        const target = returnFocus?.isConnected ? returnFocus :
          (returnSelector && root.querySelector('#ff-content ' + returnSelector)) || root.querySelector('#ff-scope > summary');
        target?.focus({ preventScroll: true });
        window.scrollTo({ left: returnScroll.x, top: returnScroll.y, behavior: 'instant' });
        content.replaceChildren();
        heading.replaceChildren();
        this.notice.textContent = '';
        currentKey = ''; currentMarkup = ''; focusHistory.clear();
        return;
      }
      const opening = !dialog.open;
      if (opening) {
        const active = root.ownerDocument.activeElement;
        returnFocus = active?.closest('#ff-profile') ? root.querySelector('#ff-profile > summary') : active;
        returnSelector = focusSelector(returnFocus);
        returnScroll = { x: window.scrollX, y: window.scrollY };
        root.querySelectorAll('.ff-menu[open]').forEach(menu => { menu.open = false; });
      }
      if (markup !== currentMarkup || key !== currentKey) {
        if (currentKey) focusHistory.set(currentKey, { selector: focusSelector(root.ownerDocument.activeElement), scroll: body.scrollTop });
        content.innerHTML = markup;
        const title = content.querySelector('.ff-detail-title') || content.querySelector('h1');
        heading.replaceChildren(title);
        const h1 = heading.querySelector('h1');
        h1.id = 'ff-dialog-title'; h1.tabIndex = -1;
        const previous = focusHistory.get(key);
        const target = (previous?.selector && dialog.querySelector(previous.selector)) || h1;
        body.scrollTop = previous?.scroll || 0;
        currentMarkup = markup; currentKey = key;
        if (opening) { html.classList.add('ff-dialog-open'); dialog.showModal(); }
        target.focus({ preventScroll: true });
      }
    },
  };
}
