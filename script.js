/* Get references to the parts of the page we need to update */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const rtlToggle = document.getElementById("rtlToggle");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectedButton = document.getElementById("clearSelected");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");

/* Backend API URL for routine generation (no key in frontend code) */
const BACKEND_URL = "/chat";
const PRODUCT_FALLBACK_IMAGE = "img/loreal-logo.png";

/* Save keys so selections and layout preferences stay after a refresh */
const STORAGE_KEYS = {
  selectedProductIds: "lorealSelectedProductIds",
  rtlEnabled: "lorealRtlEnabled",
};

/* This system message explains how the assistant should answer */
const SYSTEM_MESSAGE = {
  role: "system",
  content:
    "You are a L'Oréal skincare and beauty advisor. Answer routine and beauty questions in a beginner-friendly way. If selected products are provided in the conversation, use them first when building routines. If no products are provided, still answer with safe general guidance and practical tips. If you mention current or real-world information, include visible source links with full URLs.",
};

/* App state lives in arrays so we can re-render the page when things change */
let allProducts = [];
let selectedProducts = [];
let messages = [];
let isWaitingForReply = false;

/* Show placeholders before the user starts interacting */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Choose a category or search for a product to get started.
  </div>
`;

selectedProductsList.innerHTML = `
  <div class="placeholder-message">
    No products selected yet.
  </div>
`;

chatWindow.innerHTML = `
  <div class="placeholder-message">
    Choose products, generate a routine, then ask follow-up questions here.
  </div>
`;

/* Load all product data once, then reuse it for filtering and selection */
async function loadProducts() {
  const response = await fetch("products.json");

  if (!response.ok) {
    throw new Error("Unable to load products right now.");
  }

  const data = await response.json();
  return data.products;
}

/* Add any missing categories from products.json to the dropdown */
function populateCategoryOptions(products) {
  const existingCategories = new Set(
    Array.from(categoryFilter.options).map((option) => option.value),
  );

  const categoriesFromProducts = [
    ...new Set(products.map((product) => product.category)),
  ]
    .filter((category) => !existingCategories.has(category))
    .sort();

  categoriesFromProducts.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = formatCategoryLabel(category);
    categoryFilter.appendChild(option);
  });
}

/* Turn values like "haircare" into a friendlier label for the dropdown */
function formatCategoryLabel(category) {
  return category
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/* Save selected product ids after every change */
function saveSelectedProducts() {
  const selectedIds = selectedProducts.map((product) => product.id);
  localStorage.setItem(
    STORAGE_KEYS.selectedProductIds,
    JSON.stringify(selectedIds),
  );
}

/* Restore selected products after products.json finishes loading */
function restoreSelectedProducts() {
  const savedIds = localStorage.getItem(STORAGE_KEYS.selectedProductIds);

  if (!savedIds) {
    return;
  }

  let parsedIds = [];

  try {
    parsedIds = JSON.parse(savedIds);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEYS.selectedProductIds);
    return;
  }

  if (!Array.isArray(parsedIds)) {
    return;
  }

  selectedProducts = parsedIds
    .map((productId) => allProducts.find((product) => product.id === productId))
    .filter(Boolean);
}

/* Save and apply the chosen text direction */
function setRtlState(isRtl) {
  document.documentElement.dir = isRtl ? "rtl" : "ltr";
  rtlToggle.checked = isRtl;
  localStorage.setItem(STORAGE_KEYS.rtlEnabled, JSON.stringify(isRtl));
}

/* Restore RTL mode after page reloads */
function restoreRtlState() {
  const savedValue = localStorage.getItem(STORAGE_KEYS.rtlEnabled);

  if (!savedValue) {
    setRtlState(false);
    return;
  }

  try {
    setRtlState(JSON.parse(savedValue));
  } catch (error) {
    setRtlState(false);
  }
}

/* Escape any HTML before turning URLs into links */
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* Convert markdown links and raw URLs into visible clickable links */
function formatMessageContent(content) {
  const escapedContent = escapeHtml(content);

  const withMarkdownLinks = escapedContent.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  return withMarkdownLinks.replace(
    /(^|\s)(https?:\/\/[^\s<]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>',
  );
}

/* Use the selected category and search term together */
function getFilteredProducts() {
  const selectedCategory = categoryFilter.value;
  const searchTerm = productSearch.value.trim().toLowerCase();

  return allProducts.filter((product) => {
    const categoryMatches =
      !selectedCategory || product.category === selectedCategory;
    const searchableText = [
      product.name,
      product.brand,
      product.description,
      product.category,
    ]
      .join(" ")
      .toLowerCase();
    const searchMatches = !searchTerm || searchableText.includes(searchTerm);

    return categoryMatches && searchMatches;
  });
}

/* Render product cards for the current filter and search results */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products match your current search and filter.
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProducts.some(
        (selectedProduct) => selectedProduct.id === product.id,
      );

      return `
        <article
          class="product-card ${isSelected ? "selected" : ""}"
          data-product-id="${product.id}"
          tabindex="0"
          aria-label="${product.name} by ${product.brand}"
        >
          <img
            src="${product.image}"
            alt="${product.name}"
            onerror="this.onerror=null;this.src='${PRODUCT_FALLBACK_IMAGE}';"
          >
          <div class="product-info">
            <h3>${product.name}</h3>
            <p class="product-brand">${product.brand}</p>
            <button
              type="button"
              class="product-select-btn"
              data-product-id="${product.id}"
            >
              ${isSelected ? "Selected - click to remove" : "Select product"}
            </button>
            <details class="product-details">
              <summary>View product description</summary>
              <p>${product.description}</p>
            </details>
          </div>
        </article>
      `;
    })
    .join("");
}

/* Show the products the user has picked for the routine */
function displaySelectedProducts() {
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <div class="placeholder-message">
        No products selected yet.
      </div>
    `;
    clearSelectedButton.disabled = true;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <button type="button" data-remove-id="${product.id}">
          <span>${product.name}</span>
          <span aria-hidden="true">×</span>
        </button>
      `,
    )
    .join("");

  clearSelectedButton.disabled = false;
}

/* Keep chat messages visible in the window */
function renderChatMessage(role, content) {
  if (chatWindow.querySelector(".placeholder-message")) {
    chatWindow.innerHTML = "";
  }

  const messageElement = document.createElement("div");
  const titleElement = document.createElement("strong");
  const bodyElement = document.createElement("p");
  const speaker = role === "assistant" ? "Advisor" : "You";

  messageElement.className = "chat-message";
  titleElement.textContent = `${speaker}:`;
  bodyElement.innerHTML = formatMessageContent(content);

  messageElement.appendChild(titleElement);
  messageElement.appendChild(bodyElement);

  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Show a status message inside the chat area */
function showChatStatus(message) {
  if (chatWindow.querySelector(".placeholder-message")) {
    chatWindow.innerHTML = "";
  }

  const statusElement = document.createElement("p");
  statusElement.textContent = message;
  statusElement.style.fontStyle = "italic";
  statusElement.style.marginBottom = "16px";
  statusElement.dataset.statusMessage = "true";

  chatWindow.appendChild(statusElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Remove the temporary loading message once the request finishes */
function clearChatStatus() {
  const statusMessage = chatWindow.querySelector(
    '[data-status-message="true"]',
  );

  if (statusMessage) {
    statusMessage.remove();
  }
}

/* Disable buttons while we wait for the AI response */
function setWaitingState(isWaiting) {
  isWaitingForReply = isWaiting;
  generateRoutineButton.disabled = isWaiting;
  sendButton.disabled = isWaiting;
}

/* Refresh the product grid and selected list after state changes */
function updateProductViews() {
  displaySelectedProducts();
  displayProducts(getFilteredProducts());
}

/* Add or remove a product from the selected routine list */
function toggleSelectedProduct(productId) {
  const matchingProduct = allProducts.find(
    (product) => product.id === productId,
  );

  if (!matchingProduct) {
    return;
  }

  const alreadySelected = selectedProducts.some(
    (product) => product.id === productId,
  );

  if (alreadySelected) {
    selectedProducts = selectedProducts.filter(
      (product) => product.id !== productId,
    );
  } else {
    selectedProducts.push(matchingProduct);
  }

  saveSelectedProducts();
  updateProductViews();
}

/* Remove all selected products in one click */
function clearSelectedProducts() {
  selectedProducts = [];
  saveSelectedProducts();
  updateProductViews();
}

/* Send the full messages array to the backend proxy */
async function getAssistantReply() {
  let response;

  try {
    response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });
  } catch (error) {
    throw new Error(
      "The chatbot could not reach the backend API. Make sure server.js is running and the BACKEND_URL in script.js is correct.",
    );
  }

  const responseType = response.headers.get("content-type") || "";

  if (!response.ok) {
    if (responseType.includes("application/json")) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || "The routine service is not available right now.",
      );
    }

    const errorText = await response.text();
    throw new Error(
      errorText || "The routine service is not available right now.",
    );
  }

  if (responseType.includes("application/json")) {
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
  }

  const fallbackText = await response.text();

  if (fallbackText.trim()) {
    throw new Error(
      `${fallbackText.trim()} The backend API is not returning chat completion JSON. Check server.js logs and confirm your Mistral key is set in the server environment.`,
    );
  }

  throw new Error(
    "The backend API responded, but it did not return the expected routine data.",
  );
}

/* Turn selected products into a prompt that the AI can use */
function buildRoutinePrompt() {
  const productSummary = selectedProducts
    .map(
      (product) =>
        `${product.name} by ${product.brand}: ${product.description}`,
    )
    .join("\n");

  return `Build a personalized routine using only these selected products:\n${productSummary}`;
}

/* Generate the first full routine from the user's selected products */
async function handleGenerateRoutine() {
  if (selectedProducts.length === 0) {
    chatWindow.innerHTML = `
      <div class="placeholder-message">
        Select at least one product before generating a routine.
      </div>
    `;
    return;
  }

  const routinePrompt = buildRoutinePrompt();
  messages = [SYSTEM_MESSAGE, { role: "user", content: routinePrompt }];

  chatWindow.innerHTML = "";
  renderChatMessage("user", "Build me a routine with my selected products.");
  showChatStatus("Building your routine...");
  setWaitingState(true);

  try {
    const assistantReply = await getAssistantReply();
    clearChatStatus();
    messages.push({ role: "assistant", content: assistantReply });
    renderChatMessage("assistant", assistantReply);
  } catch (error) {
    clearChatStatus();
    renderChatMessage("assistant", error.message);
  } finally {
    setWaitingState(false);
  }
}

/* Handle follow-up chat messages after the routine is generated */
async function handleChatSubmit(event) {
  event.preventDefault();

  const question = userInput.value.trim();

  if (!question || isWaitingForReply) {
    return;
  }

  /* Start a general chat session if a routine has not been generated yet */
  if (messages.length === 0) {
    messages = [SYSTEM_MESSAGE];
  }

  renderChatMessage("user", question);
  messages.push({ role: "user", content: question });
  userInput.value = "";
  showChatStatus("Thinking...");
  setWaitingState(true);

  try {
    const assistantReply = await getAssistantReply();
    clearChatStatus();
    messages.push({ role: "assistant", content: assistantReply });
    renderChatMessage("assistant", assistantReply);
  } catch (error) {
    clearChatStatus();
    renderChatMessage("assistant", error.message);
  } finally {
    setWaitingState(false);
  }
}

/* Start the app by loading products and preparing the saved state */
async function initializeApp() {
  try {
    restoreRtlState();
    allProducts = await loadProducts();
    populateCategoryOptions(allProducts);
    restoreSelectedProducts();
    updateProductViews();
  } catch (error) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        ${error.message}
      </div>
    `;
  }
}

/* Update the product grid whenever search text or category changes */
function handleFilterChange() {
  displayProducts(getFilteredProducts());
}

categoryFilter.addEventListener("change", handleFilterChange);
productSearch.addEventListener("input", handleFilterChange);

/* Clicking a product card selects or unselects it */
productsContainer.addEventListener("click", (event) => {
  const detailsToggle = event.target.closest("summary, details");

  if (detailsToggle) {
    return;
  }

  const productCard = event.target.closest("[data-product-id]");

  if (!productCard) {
    return;
  }

  toggleSelectedProduct(Number(productCard.dataset.productId));
});

/* Keyboard users can also select a product card */
productsContainer.addEventListener("keydown", (event) => {
  const productCard = event.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleSelectedProduct(Number(productCard.dataset.productId));
  }
});

/* Let the user remove items from the selected products list */
selectedProductsList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remove-id]");

  if (!button) {
    return;
  }

  toggleSelectedProduct(Number(button.dataset.removeId));
});

clearSelectedButton.addEventListener("click", clearSelectedProducts);
generateRoutineButton.addEventListener("click", handleGenerateRoutine);
chatForm.addEventListener("submit", handleChatSubmit);
rtlToggle.addEventListener("change", () => setRtlState(rtlToggle.checked));

initializeApp();
