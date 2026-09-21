// ============================================
// Restaurant Menu Application
// ============================================

// ============================================
// Menu Data
// ============================================
const menuItems = [
  {
    id: 1,
    name: 'Classic Burger',
    description: 'Juicy beef patty with lettuce, tomato, cheese, and our special sauce.',
    price: 12.99
  },
  {
    id: 2,
    name: 'Margherita Pizza',
    description: 'Fresh mozzarella, tomatoes, basil, and olive oil on a crispy crust.',
    price: 14.99
  },
  {
    id: 3,
    name: 'Caesar Salad',
    description: 'Crisp romaine lettuce, parmesan, croutons, and Caesar dressing.',
    price: 9.99
  },
  {
    id: 4,
    name: 'Grilled Salmon',
    description: 'Fresh Atlantic salmon with herbs, served with seasonal vegetables.',
    price: 19.99
  },
  {
    id: 5,
    name: 'Pasta Alfredo',
    description: 'Creamy Alfredo sauce with fettuccine pasta and parmesan cheese.',
    price: 13.99
  },
  {
    id: 6,
    name: 'Chocolate Cake',
    description: 'Rich chocolate cake with a smooth ganache filling.',
    price: 6.99
  }
];

// ============================================
// App State
// ============================================
const AppState = {
  cart: [],
  currentView: 'menu',
  orderNumber: null
};

// ============================================
// Utility Functions
// ============================================
const Utils = {
  formatPrice(price) {
    return `$${price.toFixed(2)}`;
  },

  generateOrderNumber() {
    return `ORD-${Date.now().toString().slice(-6)}`;
  }
};

// ============================================
// Cart Management
// ============================================
const Cart = {
  key: 'restaurant-cart',

  load() {
    try {
      const savedCart = localStorage.getItem(this.key);
      AppState.cart = savedCart ? JSON.parse(savedCart) : [];
    } catch {
      AppState.cart = [];
    }
  },

  save() {
    localStorage.setItem(this.key, JSON.stringify(AppState.cart));
  },

  add(item) {
    const existingItem = AppState.cart.find(cartItem => cartItem.id === item.id);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      AppState.cart.push({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1
      });
    }
    this.save();
    UI.renderCart();
  },

  remove(itemId) {
    AppState.cart = AppState.cart.filter(item => item.id !== itemId);
    this.save();
    UI.renderCart();
  },

  updateQuantity(itemId, change) {
    const item = AppState.cart.find(cartItem => cartItem.id === itemId);
    if (!item) return;

    item.quantity += change;
    if (item.quantity <= 0) {
      this.remove(itemId);
      return;
    }

    this.save();
    UI.renderCart();
  },

  getTotal() {
    return AppState.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  },

  getItemCount() {
    return AppState.cart.reduce((total, item) => total + item.quantity, 0);
  },

  clear() {
    AppState.cart = [];
    this.save();
    UI.renderCart();
  }
};

// ============================================
// UI Renderer
// ============================================
const UI = {
  elements: {},

  init() {
    this.elements = {
      menuGrid: document.getElementById('menuGrid'),
      cartIcon: document.getElementById('cartIcon'),
      cartCount: document.getElementById('cartCount'),
      cartSection: document.getElementById('cartSection'),
      cartItems: document.getElementById('cartItems'),
      cartTotal: document.getElementById('cartTotal'),
      checkoutBtn: document.getElementById('checkoutBtn'),
      checkoutPage: document.getElementById('checkoutPage'),
      checkoutForm: document.getElementById('checkoutForm'),
      checkoutSummary: document.getElementById('checkoutSummary'),
      orderConfirmation: document.getElementById('orderConfirmation'),
      orderNumber: document.getElementById('orderNumber')
    };
  },

  renderMenu() {
    this.elements.menuGrid.innerHTML = '';

    menuItems.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'menu-item';
      itemEl.dataset.id = item.id;
      itemEl.innerHTML = `
        <h3>${item.name}</h3>
        <p class="description">${item.description}</p>
        <div class="price">${Utils.formatPrice(item.price)}</div>
        <button class="add-btn" data-id="${item.id}">Add to Cart</button>
      `;
      this.elements.menuGrid.appendChild(itemEl);
    });

    this.elements.menuGrid.addEventListener('click', (e) => {
      const button = e.target.closest('.add-btn');
      if (!button) return;

      const item = menuItems.find(menuItem => menuItem.id === parseInt(button.dataset.id));
      if (item) {
        Cart.add(item);
        button.textContent = 'Added to Cart';
        button.classList.add('added');
        setTimeout(() => {
          button.textContent = 'Add to Cart';
          button.classList.remove('added');
        }, 1000);
      }
    });
  },

  renderCart() {
    this.elements.cartItems.innerHTML = '';
    this.elements.cartCount.textContent = Cart.getItemCount();

    if (AppState.cart.length === 0) {
      this.elements.cartSection.style.display = 'none';
      return;
    }

    this.elements.cartSection.style.display = 'block';

    AppState.cart.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'cart-item';
      itemEl.innerHTML = `
        <div class="cart-item-info">
          <h4>${item.name}</h4>
          <div class="item-price">${Utils.formatPrice(item.price)} x ${item.quantity}</div>
        </div>
        <div class="cart-item-actions">
          <button class="qty-btn" data-action="decrease" data-id="${item.id}">-</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" data-action="increase" data-id="${item.id}">+</button>
          <button class="remove-btn" data-id="${item.id}">Remove</button>
        </div>
      `;
      this.elements.cartItems.appendChild(itemEl);
    });

    this.elements.cartItems.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;

      const itemId = parseInt(button.dataset.id);
      const action = button.dataset.action;

      if (action === 'increase') {
        Cart.updateQuantity(itemId, 1);
      } else if (action === 'decrease') {
        Cart.updateQuantity(itemId, -1);
      } else if (button.classList.contains('remove-btn')) {
        Cart.remove(itemId);
      }
    });

    this.elements.cartTotal.textContent = Cart.getTotal().toFixed(2);
  },

  showView(view) {
    AppState.currentView = view;

    const menuSection = document.querySelector('.menu-section');
    const cartSection = document.getElementById('cartSection');
    const checkoutPage = document.getElementById('checkoutPage');
    const orderConfirmation = document.getElementById('orderConfirmation');

    menuSection.style.display = view === 'menu' ? 'block' : 'none';
    cartSection.style.display = view === 'menu' && AppState.cart.length > 0 ? 'block' : 'none';
    checkoutPage.style.display = view === 'checkout' ? 'block' : 'none';
    orderConfirmation.style.display = view === 'confirmation' ? 'block' : 'none';

    if (view === 'checkout') {
      this.renderCheckout();
    }
  },

  renderCheckout() {
    this.elements.checkoutSummary.innerHTML = '';

    AppState.cart.forEach(item => {
      const summaryItem = document.createElement('div');
      summaryItem.className = 'summary-item';
      summaryItem.innerHTML = `
        <span>${item.name} x ${item.quantity}</span>
        <span>${Utils.formatPrice(item.price * item.quantity)}</span>
      `;
      this.elements.checkoutSummary.appendChild(summaryItem);
    });

    const totalItem = document.createElement('div');
    totalItem.className = 'summary-total';
    totalItem.innerHTML = `
      <span>Total</span>
      <span>${Utils.formatPrice(Cart.getTotal())}</span>
    `;
    this.elements.checkoutSummary.appendChild(totalItem);
  },

  showOrderConfirmation() {
    this.elements.orderNumber.textContent = AppState.orderNumber;
    this.showView('confirmation');
  }
};

// ============================================
// Events
// ============================================
const Events = {
  setup() {
    UI.elements.cartIcon.addEventListener('click', () => {
      if (AppState.cart.length === 0) {
        UI.showView('menu');
        return;
      }
      UI.showView('menu');
    });

    UI.elements.checkoutBtn.addEventListener('click', () => {
      UI.showView('checkout');
    });

    UI.elements.checkoutForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('customerName').value.trim();
      const phone = document.getElementById('customerPhone').value.trim();
      const address = document.getElementById('customerAddress').value.trim();

      if (!name || !phone || !address) {
        alert('Please fill in all required fields.');
        return;
      }

      AppState.orderNumber = Utils.generateOrderNumber();
      Cart.clear();
      UI.showOrderConfirmation();
    });

    document.getElementById('backToMenuBtn').addEventListener('click', () => {
      UI.showView('menu');
    });

    document.getElementById('newOrderBtn').addEventListener('click', () => {
      UI.showView('menu');
    });
  }
};

// ============================================
// Initialize Application
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  UI.init();
  Cart.load();
  UI.renderMenu();
  UI.renderCart();
  Events.setup();
});