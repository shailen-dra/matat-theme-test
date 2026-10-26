/**
 * Components shared across pages: side drawers, the cart (drawer and cart
 * page line items), wishlist, quick add, collection and search filters, and
 * the product form, gallery, quantity input and variant syncing they rely on.
 *
 * These live in one asset (instead of `{% javascript %}` tags) because
 * Shopify only bundles a file's `{% javascript %}` on pages where that file
 * is rendered, while product cards, the quick view and the wishlist load this
 * markup on any page. Loaded with `defer` from the layout, before the
 * compiled section scripts.
 */

/* Side drawers (cart drawer, wishlist drawer) */

/**
 * A modal side panel built on <dialog>. Open it with any element that has
 * `data-drawer-open="<drawer id>"` (a link keeps working as a normal link
 * for new-tab clicks) or with `drawer.show(trigger)`.
 */
class SideDrawer extends HTMLElement {
  connectedCallback() {
    this.dialog = this.querySelector('dialog');
    this.dialog.addEventListener('click', this.onClick);
    this.dialog.addEventListener('close', this.onClose);
  }

  get isOpen() {
    return this.dialog.open;
  }

  show(trigger) {
    this.trigger = trigger ?? document.activeElement;
    // Only one drawer or quick view at a time
    document.querySelectorAll('side-drawer').forEach((drawer) => drawer !== this && drawer.hide());
    document.querySelector('quick-view-dialog dialog[open]')?.close();

    if (!this.dialog.open) this.dialog.showModal();
    this.dispatchEvent(new CustomEvent('drawer:open'));
  }

  hide() {
    if (this.dialog.open) this.dialog.close();
  }

  onClick = (event) => {
    // Backdrop click or a close button
    if (event.target === this.dialog || event.target.closest('[data-drawer-close]')) this.hide();
  };

  onClose = () => {
    if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
  };
}

if (!customElements.get('side-drawer')) {
  customElements.define('side-drawer', SideDrawer);
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-drawer-open]');
  if (!trigger || event.metaKey || event.ctrlKey || event.shiftKey || event.button > 0) return;
  const drawer = document.getElementById(trigger.dataset.drawerOpen);
  if (!drawer?.show) return;
  event.preventDefault();
  drawer.show(trigger);
});

/* Cart: shared helpers and line items (sections/cart.liquid, sections/cart-drawer.liquid) */

/**
 * Keeps every view of the cart in sync: the header count, the cart drawer
 * and the cart page. Ajax cart requests ask Shopify to re-render all of them
 * (`sections`) and pass the result to `ThemeCart.render`.
 */
window.ThemeCart = {
  get root() {
    return window.Shopify?.routes?.root ?? '/';
  },

  headerSectionId() {
    const section = document.querySelector('header-component')?.closest('.shopify-section');
    return section?.id.replace('shopify-section-', '');
  },

  sectionIds() {
    const ids = [this.headerSectionId(), ...[...document.querySelectorAll('cart-items')].map((el) => el.sectionId)];
    return [...new Set(ids.filter(Boolean))];
  },

  render(sections = {}, { except } = {}) {
    const headerHtml = sections[this.headerSectionId()];
    if (headerHtml) {
      const fresh = new DOMParser().parseFromString(headerHtml, 'text/html').querySelector('.header__cart');
      const current = document.querySelector('.header__cart');
      if (fresh && current) current.innerHTML = fresh.innerHTML;
    }

    document.querySelectorAll('cart-items').forEach((cartItems) => {
      if (cartItems !== except) cartItems.render(sections[cartItems.sectionId]);
    });
  },

  /** Opens the cart drawer after adding, unless the shopper is on the cart page */
  openDrawer(trigger) {
    if (document.querySelector('cart-items[data-cart-page]')) return;
    document.getElementById('CartDrawer')?.show(trigger);
  },
};

/**
 * Line items of the cart page or cart drawer: quantity changes, removals and
 * the order note go through the Ajax Cart API, then every cart view is
 * re-rendered. Each instance swaps only its own markup.
 */
class CartItems extends HTMLElement {
  connectedCallback() {
    this.sectionId = this.dataset.sectionId;
    this.timers = new Map();
    this.addEventListener('change', this.onChange);
    this.addEventListener('click', this.onClick);
    this.addEventListener('input', this.onNoteInput);
  }

  disconnectedCallback() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.abortController?.abort();
  }

  onChange = (event) => {
    if (event.target.name !== 'updates[]') return;
    const item = event.target.closest('[data-line]');
    if (!item) return;
    const quantity = Math.max(0, parseInt(event.target.value, 10) || 0);

    // Wait for rapid +/- clicks to settle before sending one request
    clearTimeout(this.timers.get(item.dataset.line));
    this.timers.set(
      item.dataset.line,
      setTimeout(() => this.updateQuantity(Number(item.dataset.line), quantity, event.target.id), 350)
    );
  };

  onClick = (event) => {
    const remove = event.target.closest('[data-cart-remove]');
    if (!remove) return;
    event.preventDefault();
    const item = remove.closest('[data-line]');
    if (item) this.updateQuantity(Number(item.dataset.line), 0);
  };

  onNoteInput = (event) => {
    if (!event.target.matches('[data-cart-note]')) return;
    clearTimeout(this.timers.get('note'));
    this.timers.set(
      'note',
      setTimeout(() => {
        fetch(`${window.ThemeCart.root}cart/update.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ note: event.target.value }),
        }).catch((error) => console.error(error));
      }, 500)
    );
  };

  async updateQuantity(line, quantity, focusId) {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(`${window.ThemeCart.root}cart/change.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          line,
          quantity,
          sections: window.ThemeCart.sectionIds(),
          sections_url: window.location.pathname,
        }),
        signal: this.abortController.signal,
      });
      const data = await response.json();

      if (!response.ok || data.status) {
        this.showError(line, data.description || data.message);
        this.resetQuantity(line);
        return;
      }

      this.render(data.sections?.[this.sectionId], focusId);
      window.ThemeCart.render(data.sections, { except: this });

      // The cart may cap the quantity at the available stock
      const updated = data.items?.[line - 1];
      if (quantity > 0 && updated && updated.quantity < quantity) {
        this.showError(line, this.querySelector('[data-cart-error]')?.dataset.stockMessage);
      }

      const status = this.querySelector('[data-cart-status]');
      if (status) status.textContent = this.querySelector('[data-cart-count]')?.textContent ?? '';

      document.dispatchEvent(new CustomEvent('cart:update', { detail: { cart: data } }));
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      this.showError(line);
      this.resetQuantity(line);
    } finally {
      this.removeAttribute('aria-busy');
    }
  }

  /** Swaps in freshly rendered markup of this section */
  render(html, focusId) {
    if (!html) return;
    const fresh = new DOMParser().parseFromString(html, 'text/html');
    const freshContent = fresh.querySelector('[data-cart-content]');
    if (!freshContent) return;

    if (fresh.querySelector('[data-cart-items]') && this.querySelector('[data-cart-items]')) {
      // Swap only what changed so the note and checkout buttons keep their state
      ['[data-cart-items]', '[data-cart-totals]', '[data-cart-count]'].forEach((selector) => {
        const next = fresh.querySelector(selector);
        const current = this.querySelector(selector);
        if (next && current) current.replaceWith(next);
      });
    } else {
      this.querySelector('[data-cart-content]')?.replaceWith(freshContent);
    }

    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }

  resetQuantity(line) {
    const input = this.querySelector(`[data-line="${line}"] input[name="updates[]"]`);
    if (input) input.value = input.defaultValue;
  }

  showError(line, message) {
    const error = this.querySelector(`[data-line="${line}"] [data-cart-error]`);
    if (!error) return;
    error.textContent = message || error.dataset.fallback;
    error.hidden = false;
  }
}

if (!customElements.get('cart-items')) {
  customElements.define('cart-items', CartItems);
}

/* Wishlist store, heart buttons and counters (snippets/wishlist-button.liquid) */

/**
 * Wishlist store: product handles in localStorage, shared by every
 * wishlist button, counter and the wishlist page. Changes fire a
 * `wishlist:change` event on the document (also across browser tabs).
 */
if (!window.Wishlist) {
  const STORAGE_KEY = 'theme:wishlist';

  window.Wishlist = {
    get() {
      try {
        const items = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    },

    set(handles) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(handles));
      } catch {
        // Storage can be unavailable (private mode); the change still applies to this page
      }
      document.dispatchEvent(new CustomEvent('wishlist:change', { detail: { handles } }));
    },

    has(handle) {
      return this.get().includes(handle);
    },

    toggle(handle) {
      const handles = this.get();
      const next = handles.includes(handle) ? handles.filter((h) => h !== handle) : [handle, ...handles];
      this.set(next);
      return next.includes(handle);
    },

    remove(handle) {
      this.set(this.get().filter((h) => h !== handle));
    },
  };

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      document.dispatchEvent(new CustomEvent('wishlist:change', { detail: { handles: window.Wishlist.get() } }));
    }
  });
}

class WishlistButton extends HTMLElement {
  connectedCallback() {
    this.button = this.querySelector('button');
    this.button.addEventListener('click', this.onClick);
    document.addEventListener('wishlist:change', this.sync);
    this.sync();
  }

  disconnectedCallback() {
    document.removeEventListener('wishlist:change', this.sync);
  }

  onClick = (event) => {
    // Cards are links; keep the click on the button
    event.preventDefault();
    event.stopPropagation();
    const saved = window.Wishlist.toggle(this.button.dataset.handle);
    if (saved) {
      this.button.classList.add('is-popping');
      setTimeout(() => this.button.classList.remove('is-popping'), 250);
    }
  };

  sync = () => {
    const saved = window.Wishlist.has(this.button.dataset.handle);
    this.button.setAttribute('aria-pressed', String(saved));
    const label = saved ? this.button.dataset.labelRemove : this.button.dataset.labelAdd;
    if (this.button.hasAttribute('aria-label')) this.button.setAttribute('aria-label', label);
    const text = this.button.querySelector('[data-wishlist-text]');
    if (text) text.textContent = saved ? text.dataset.textRemove : text.dataset.textAdd;
  };
}

if (!customElements.get('wishlist-button')) {
  customElements.define('wishlist-button', WishlistButton);
}

/** Shows the number of saved products, hidden while the wishlist is empty */
class WishlistCount extends HTMLElement {
  connectedCallback() {
    document.addEventListener('wishlist:change', this.sync);
    this.sync();
  }

  disconnectedCallback() {
    document.removeEventListener('wishlist:change', this.sync);
  }

  sync = () => {
    const count = window.Wishlist.get().length;
    this.textContent = count;
    this.hidden = count === 0;
  };
}

if (!customElements.get('wishlist-count')) {
  customElements.define('wishlist-count', WishlistCount);
}

/* Quantity input (snippets/quantity-input.liquid) */

class QuantityInput extends HTMLElement {
  connectedCallback() {
    this.input = this.querySelector('input');
    this.addEventListener('click', this.onClick);
    this.input.addEventListener('change', this.updateButtons);
    this.updateButtons();
  }

  onClick = (event) => {
    const button = event.target.closest('[data-quantity-step]');
    if (!button) return;
    const previous = this.input.value;
    Number(button.dataset.quantityStep) > 0 ? this.input.stepUp() : this.input.stepDown();
    if (previous !== this.input.value) {
      this.input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  updateButtons = () => {
    const value = Number(this.input.value);
    const [decrease, increase] = this.querySelectorAll('[data-quantity-step]');
    decrease.disabled = this.input.min !== '' && value <= Number(this.input.min);
    increase.disabled = this.input.max !== '' && value >= Number(this.input.max);
  };
}

if (!customElements.get('quantity-input')) {
  customElements.define('quantity-input', QuantityInput);
}

/* Product gallery (snippets/product-gallery.liquid) */

/** Arrow, counter and thumbnail navigation for the product media carousel. */
class ProductGallery extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-gallery-track]');
    this.items = [...this.track.children];
    this.prev = this.querySelector('[data-gallery-prev]');
    this.next = this.querySelector('[data-gallery-next]');
    this.counter = this.querySelector('[data-gallery-current]');
    this.thumbnails = [...this.querySelectorAll('[data-gallery-thumbnail]')];
    if (this.items.length < 2) return;

    this.prev?.addEventListener('click', () => this.goTo(this.index - 1));
    this.next?.addEventListener('click', () => this.goTo(this.index + 1));
    this.thumbnails.forEach((thumbnail) =>
      thumbnail.addEventListener('click', () => this.goTo(Number(thumbnail.dataset.galleryThumbnail)))
    );
    this.track.addEventListener('scroll', this.onScroll, { passive: true });
    this.track.addEventListener('keydown', this.onKeydown);
    this.update();
  }

  disconnectedCallback() {
    this.track?.removeEventListener('scroll', this.onScroll);
  }

  get isRTL() {
    return getComputedStyle(this).direction === 'rtl';
  }

  get step() {
    return this.items[1].offsetWidth + (parseFloat(getComputedStyle(this.track).columnGap) || 0);
  }

  get index() {
    return Math.round(Math.abs(this.track.scrollLeft) / this.step);
  }

  goTo(index) {
    const target = Math.max(0, Math.min(index, this.items.length - 1));
    this.track.scrollTo({ left: target * this.step * (this.isRTL ? -1 : 1) });
  }

  onScroll = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.update());
  };

  onKeydown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const forward = (event.key === 'ArrowRight') !== this.isRTL;
    this.goTo(this.index + (forward ? 1 : -1));
    event.preventDefault();
  };

  update() {
    const index = this.index;
    if (this.counter) this.counter.textContent = index + 1;
    if (this.prev) this.prev.disabled = index === 0;
    if (this.next) this.next.disabled = index === this.items.length - 1;
    this.thumbnails.forEach((thumbnail, i) => thumbnail.setAttribute('aria-current', String(i === index)));
  }
}

if (!customElements.get('product-gallery')) {
  customElements.define('product-gallery', ProductGallery);
}

/* Product info (variant changes) (snippets/product-info.liquid) */

/**
 * Keeps the product section in sync with the selected variant: re-renders
 * the section for the chosen option values and swaps every element marked
 * with `data-update`, so price, stock and buy buttons stay server-rendered.
 */
class ProductInfo extends HTMLElement {
  connectedCallback() {
    this.addEventListener('change', this.onOptionChange);
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onOptionChange);
    this.abortController?.abort();
  }

  onOptionChange = (event) => {
    const picker = event.target.closest('[data-variant-picker]');
    if (!picker) return;

    const selected = [...picker.querySelectorAll('input:checked, select')].map((input) =>
      input.tagName === 'SELECT' ? input.selectedOptions[0] : input
    );

    // Combined listings: a value may belong to a sibling product
    const targetUrl = event.target.tagName === 'SELECT'
      ? event.target.selectedOptions[0]?.dataset.productUrl
      : event.target.dataset.productUrl;
    if (targetUrl && targetUrl !== this.dataset.productUrl) {
      window.location.href = targetUrl;
      return;
    }

    const optionValues = selected.map((el) => el.dataset.optionValueId).join(',');
    this.renderVariant(optionValues, event.target.id);
  };

  async renderVariant(optionValues, focusId) {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.setAttribute('aria-busy', 'true');

    try {
      const params = new URLSearchParams({ option_values: optionValues, section_id: this.dataset.sectionId });
      const response = await fetch(`${this.dataset.productUrl}?${params}`, {
        signal: this.abortController.signal,
      });
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const next = html.querySelector(`product-info[data-section-id="${this.dataset.sectionId}"]`);
      if (!next) return;

      this.querySelectorAll('[data-update]').forEach((current) => {
        const fresh = next.querySelector(`[data-update="${current.dataset.update}"]`);
        if (!fresh) return;
        // Only swap the gallery when the variant actually shows different media
        if (current.dataset.featuredMediaId && current.dataset.featuredMediaId === fresh.dataset.featuredMediaId) return;
        current.replaceWith(fresh);
      });

      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });

      const variantId = next.dataset.variantId;
      this.dataset.variantId = variantId;
      if (variantId && this.dataset.updateUrl === 'true') {
        window.history.replaceState({}, '', `${this.dataset.productUrl}?variant=${variantId}`);
      }

      this.dispatchEvent(new CustomEvent('variant:change', { bubbles: true, detail: { variantId } }));
    } catch (error) {
      if (error.name !== 'AbortError') console.error(error);
    } finally {
      this.removeAttribute('aria-busy');
    }
  }
}

if (!customElements.get('product-info')) {
  customElements.define('product-info', ProductInfo);
}

/* Product form (add to cart) (blocks/buy-buttons.liquid) */

/**
 * Adds the selected variant to the cart with the Ajax API, re-renders the
 * header count and cart views, and opens the cart drawer when it is enabled.
 * Dispatches `cart:update` for other components to react to.
 */
class ProductForm extends HTMLElement {
  connectedCallback() {
    this.form = this.querySelector('form');
    this.form?.addEventListener('submit', this.onSubmit);
    document.addEventListener('variant:change', this.onVariantChange);
  }

  disconnectedCallback() {
    this.form?.removeEventListener('submit', this.onSubmit);
    document.removeEventListener('variant:change', this.onVariantChange);
  }

  /** Dynamic checkout buttons are rendered once by Shopify, so only toggle them */
  onVariantChange = () => {
    const canBuy = !this.querySelector('[data-add-to-cart]')?.disabled;
    this.querySelector('[data-dynamic-checkout]')?.classList.toggle('buy-buttons__dynamic--hidden', !canBuy);
    this.toggleMessages();
  };

  onSubmit = async (event) => {
    event.preventDefault();
    const button = this.querySelector('[data-add-to-cart]');
    if (!button || button.disabled || button.getAttribute('aria-busy') === 'true') return;

    this.toggleMessages();
    button.setAttribute('aria-busy', 'true');

    const formData = new FormData(this.form);
    formData.append('sections', window.ThemeCart.sectionIds().join(','));
    formData.append('sections_url', window.location.pathname);

    try {
      const root = window.Shopify?.routes?.root ?? '/';
      const response = await fetch(`${root}cart/add.js`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || data.status) {
        this.toggleMessages({ error: data.description || data.message });
        return;
      }

      window.ThemeCart.render(data.sections);
      this.toggleMessages({ success: true });
      document.dispatchEvent(new CustomEvent('cart:update', { detail: { item: data } }));
      window.ThemeCart.openDrawer(this.querySelector('[data-add-to-cart]'));
    } catch (error) {
      console.error(error);
      this.toggleMessages({ error: '' });
    } finally {
      button.removeAttribute('aria-busy');
    }
  };

  toggleMessages({ success = false, error = null } = {}) {
    const added = this.querySelector('[data-added-message]');
    const failed = this.querySelector('[data-error-message]');
    if (added) added.hidden = !success;
    if (failed) {
      failed.hidden = error === null;
      failed.textContent = error || failed.dataset.fallback;
    }
  }
}

if (!customElements.get('product-form')) {
  customElements.define('product-form', ProductForm);
}

/* Quick add on product cards (snippets/quick-add.liquid) */

/**
 * Quick add on product cards: adds single-variant products with the Ajax
 * Cart API (refreshing the cart views and opening the cart drawer) or opens
 * the quick view dialog for products with options.
 */
class QuickAdd extends HTMLElement {
  connectedCallback() {
    this.button = this.querySelector('button');
    this.button?.addEventListener('click', this.onClick);
  }

  onClick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (this.button.dataset.quickViewUrl) {
      document.querySelector('quick-view-dialog')?.open(this.button.dataset.quickViewUrl, this.button);
    } else {
      this.addToCart();
    }
  };

  async addToCart() {
    if (this.button.getAttribute('aria-busy') === 'true') return;
    this.button.setAttribute('aria-busy', 'true');

    try {
      const root = window.Shopify?.routes?.root ?? '/';
      const response = await fetch(`${root}cart/add.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: [{ id: Number(this.button.dataset.variantId), quantity: 1 }],
          sections: window.ThemeCart.sectionIds(),
          sections_url: window.location.pathname,
        }),
      });
      const data = await response.json();

      if (!response.ok || data.status) {
        // Out of stock or similar: let the product page explain
        window.location.href = this.closest('.card')?.querySelector('a')?.href ?? window.location.href;
        return;
      }

      window.ThemeCart.render(data.sections);
      this.showAdded();
      document.dispatchEvent(new CustomEvent('cart:update', { detail: { item: data } }));
      window.ThemeCart.openDrawer(this.button);
    } catch (error) {
      console.error(error);
    } finally {
      this.button.removeAttribute('aria-busy');
    }
  }

  showAdded() {
    const text = this.button.querySelector('[data-quick-add-text]');
    const original = text?.textContent;
    const originalLabel = this.button.getAttribute('aria-label');
    this.button.classList.add('is-added');
    if (text) text.textContent = this.button.dataset.addedLabel;
    this.button.setAttribute('aria-label', this.button.dataset.addedLabel);

    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      this.button.classList.remove('is-added');
      if (text) text.textContent = original;
      this.button.setAttribute('aria-label', originalLabel);
    }, 2000);
  }
}

if (!customElements.get('quick-add')) {
  customElements.define('quick-add', QuickAdd);
}

/* Collection and search filters */

/**
 * Filtering and sorting for the collection and search pages. Form changes
 * re-render the section through the Section Rendering API and swap the
 * results and the filter form, keeping the URL in sync so results can be shared and the
 * back button works. On mobile the filter panel is an off-canvas drawer.
 */
class CollectionFacets extends HTMLElement {
  connectedCallback() {
    this.sectionId = this.dataset.sectionId;
    this.addEventListener('change', this.onChange);
    this.addEventListener('input', this.onInput);
    this.addEventListener('submit', this.onSubmit);
    this.addEventListener('click', this.onClick);
    this.addEventListener('keydown', this.onKeydown);
    window.addEventListener('popstate', this.onPopState);
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.onPopState);
    this.abortController?.abort();
    document.documentElement.style.removeProperty('overflow');
  }

  get form() {
    return this.querySelector('[data-facets-form]');
  }

  get panel() {
    return this.querySelector('[data-facets-panel]');
  }

  onChange = (event) => {
    if (event.target.matches('[data-facets-price]')) return;
    if (!event.target.closest('[data-facets-form], [data-facets-sort]')) return;
    this.submitForm();
  };

  /** Price fields update while typing, after a short pause */
  onInput = (event) => {
    if (!event.target.matches('[data-facets-price]')) return;
    clearTimeout(this.priceTimer);
    this.pricePending = true;
    this.priceTimer = setTimeout(() => this.submitForm(), 600);
  };

  onSubmit = (event) => {
    if (!event.target.matches('[data-facets-form]')) return;
    event.preventDefault();
    this.submitForm();
  };

  onClick = (event) => {
    const link = event.target.closest('a[data-facets-link]');
    if (link) {
      event.preventDefault();
      this.render(new URL(link.href, window.location.origin).searchParams.toString());
      return;
    }

    if (event.target.closest('[data-facets-open]')) this.openPanel();
    else if (event.target.closest('[data-facets-close]')) this.closePanel();
  };

  onKeydown = (event) => {
    if (event.key === 'Escape' && this.panel?.classList.contains('is-open')) this.closePanel();
  };

  onPopState = () => {
    this.render(window.location.search.slice(1), { updateHistory: false });
  };

  submitForm() {
    this.pricePending = false;
    const form = this.form;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (value !== '') params.append(key, value);
    }
    this.render(params.toString());
  }

  async render(searchParams, { updateHistory = true } = {}) {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.setAttribute('aria-busy', 'true');

    const focusedId = this.contains(document.activeElement) ? document.activeElement.id : null;
    const priceValues = new Map(
      [...this.querySelectorAll('[data-facets-price]')].map((input) => [input.id, input.value])
    );
    const openFacets = new Set([...this.querySelectorAll('details.facet')].filter((d) => d.open).map((d) => d.id));
    const closedFacets = new Set([...this.querySelectorAll('details.facet')].filter((d) => !d.open).map((d) => d.id));

    try {
      const params = new URLSearchParams(searchParams);
      params.set('section_id', this.sectionId);
      const response = await fetch(`${window.location.pathname}?${params}`, {
        signal: this.abortController.signal,
      });
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const fresh = html.querySelector('collection-facets');
      if (!fresh) return;

      // Swap results, counts and the filter form; keep the panel itself so the drawer stays open
      [
        '[data-facets-results]',
        '[data-facets-results-count]',
        '[data-facets-active-count]',
        '[data-facets-form-wrapper]',
        '[data-facets-view-results]',
      ].forEach((selector) => {
        const current = this.querySelector(selector);
        const next = fresh.querySelector(selector);
        if (current && next) current.replaceWith(next);
      });

      // Keep the clear-all link pointing at the current sort order
      const clearLink = this.querySelector('.facets__footer [data-facets-link]');
      const freshClear = fresh.querySelector('.facets__footer [data-facets-link]');
      if (clearLink && freshClear) clearLink.href = freshClear.href;

      this.querySelectorAll('details.facet').forEach((details) => {
        if (openFacets.has(details.id)) details.open = true;
        if (closedFacets.has(details.id)) details.open = false;
      });

      // Don't overwrite a price the shopper is still typing
      if (this.pricePending) {
        this.querySelectorAll('[data-facets-price]').forEach((input) => {
          if (priceValues.has(input.id)) input.value = priceValues.get(input.id);
        });
      }

      if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });

      if (updateHistory) {
        const url = searchParams ? `${window.location.pathname}?${searchParams}` : window.location.pathname;
        window.history.pushState({}, '', url);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        // Fall back to a full page load
        window.location.search = searchParams;
      }
    } finally {
      this.removeAttribute('aria-busy');
    }
  }

  openPanel() {
    const panel = this.panel;
    if (!panel) return;
    this.lastTrigger = document.activeElement;
    panel.classList.add('is-open');
    this.querySelector('.collection__backdrop')?.removeAttribute('hidden');
    this.querySelector('[data-facets-open]')?.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    requestAnimationFrame(() => panel.querySelector('.facets__close')?.focus());
  }

  closePanel() {
    const panel = this.panel;
    if (!panel?.classList.contains('is-open')) return;
    panel.classList.remove('is-open');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    this.querySelector('.collection__backdrop')?.setAttribute('hidden', '');
    this.querySelector('[data-facets-open]')?.setAttribute('aria-expanded', 'false');
    document.documentElement.style.removeProperty('overflow');
    this.lastTrigger?.focus({ preventScroll: true });
  }
}

if (!customElements.get('collection-facets')) {
  customElements.define('collection-facets', CollectionFacets);
}
