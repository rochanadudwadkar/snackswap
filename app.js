const USDA_API_KEY = "TjLY1odkcIqKAhZ8PqY0DQGpZEHQPEpqxXxKbF1E"; //configuration

// ====== CACHE (localStorage) ======
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cacheKey(prefix, key) {
  return `snackswap:${prefix}:${key}`;
}

function cacheGet(prefix, key) {
  try {
    const raw = localStorage.getItem(cacheKey(prefix, key));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.t || !parsed.v) return null;

    const isExpired = Date.now() - parsed.t > CACHE_TTL_MS;
    if (isExpired) {
      localStorage.removeItem(cacheKey(prefix, key));
      return null;
    }

    return parsed.v;
  } catch {
    return null;
  }
}

function cacheSet(prefix, key, value) {
  try {
    localStorage.setItem(cacheKey(prefix, key), JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // If storage is full or blocked, fail silently
  }
}


// ====== ELEMENTS ======
const els = {
  query: document.getElementById("query"),
  searchBtn: document.getElementById("searchBtn"),
  searchForm: document.getElementById("searchForm"),
  status: document.getElementById("status"),
  mainRow: document.getElementById("mainRow"),
  searchResults: document.getElementById("searchResults"),
  resultsList: document.getElementById("resultsList"),
  foodDetails: document.getElementById("foodDetails"),
  swapResults: document.getElementById("swapResults"),
};

let selectedFood = null;
let lastSearchResults = [];
let currentPage = 0;
let selectedSwap = null;
let selectedSwapNutrition = null;
const RESULTS_PER_PAGE = 10;

// ====== SWAP CATALOG (curated product logic) ======
const SWAPS_BY_CATEGORY = {
  chips: [
    "air-popped popcorn",
    "roasted chickpeas",
    "edamame",
    "carrots and hummus",
    "rice cakes",
  ],
  soda: [
    "sparkling water",
    "unsweetened iced tea",
    "water with lemon",
    "coconut water unsweetened",
    "kombucha low sugar",
  ],
  cookies: [
    "greek yogurt plain",
    "apple",
    "banana",
    "dark chocolate 70%",
    "oatmeal",
  ],
  chocolate_candy: [
    "dark chocolate 70%",
    "strawberries",
    "greek yogurt plain",
    "trail mix",
    "dates",
  ],
  ice_cream: [
    "greek yogurt plain",
    "frozen yogurt",
    "banana",
    "berries",
    "protein shake",
  ],
  energy_bar: [
    "banana and peanut butter",
    "greek yogurt plain",
    "cottage cheese",
    "nuts almonds",
    "hard boiled egg",
  ],
  dessert: [
    "greek yogurt plain",
    "berries",
    "banana",
    "dark chocolate" ,
    "air-popped popcorn",
  ],
  other: [
    "greek yogurt plain",
    "apple",
    "air-popped popcorn",
    "edamame",
    "nuts almonds",
  ],
};

const CATEGORY_COPY = {
    chips: "Craving crunch? Try these swaps that keep the crunch but feel lighter.",
    soda: "Want something fizzy without the sugar hit? Here are better sip options.",
    cookies: "Sweet tooth moment—these swaps satisfy dessert cravings with less heaviness.",
    chocolate_candy: "Chocolate craving? These swaps keep it sweet while being more balanced.",
    ice_cream: "Cold dessert craving—these swaps give a similar treat vibe with less guilt.",
    energy_bar: "Need quick energy? These swaps are easy and often more filling.",
    dessert: "Cake/dessert craving—try these lighter alternatives that still feel like a treat.",
    other: "Here are a few simple, healthier swaps you can try right now.",
};
  
// ====== API HELPERS ======
async function usdaSearchFoods(query, pageSize = 10) {
    const normalized = query.trim().toLowerCase();
    const key = `${normalized}|${pageSize}`;
  
    const cached = cacheGet("search", key);
    if (cached) return cached;
  
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(
      USDA_API_KEY
    )}`;
  
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        pageSize,
      }),
    });
  
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`USDA search failed (${res.status}). ${text}`);
    }
  
    const data = await res.json();
    cacheSet("search", key, data);
    return data;
}  

async function usdaGetFood(fdcId) {
    const key = String(fdcId);
  
    const cached = cacheGet("food", key);
    if (cached) return cached;
  
    const url = `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(
      fdcId
    )}?api_key=${encodeURIComponent(USDA_API_KEY)}`;
  
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`USDA get food failed (${res.status}). ${text}`);
    }
  
    const data = await res.json();
    cacheSet("food", key, data);
    return data;
}
  

// ====== DATA HELPERS ======
function round1(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}

function getNutrientAmount(food, wantedNames) {
  const list = food?.foodNutrients || [];
  const lowerWanted = wantedNames.map((n) => n.toLowerCase());

  for (const item of list) {
    const name = item?.nutrient?.name?.toLowerCase();
    if (!name) continue;
    if (lowerWanted.includes(name)) {
      return item.amount ?? null;
    }
  }
  return null;
}

function extractNutrition(food) {
    const calories = getNutrientAmount(food, ["Energy"]);
    const protein = getNutrientAmount(food, ["Protein"]);
    const totalFat = getNutrientAmount(food, ["Total lipid (fat)"]);
    const carbs = getNutrientAmount(food, ["Carbohydrate, by difference"]);
    const fiber = getNutrientAmount(food, ["Fiber, total dietary"]);
    const sodium = getNutrientAmount(food, ["Sodium, Na"]);
  
    const sugar =
      getNutrientAmount(food, ["Sugars, total including NLEA"]) ??
      getNutrientAmount(food, ["Sugars, total"]) ??
      getNutrientAmount(food, ["Total Sugars"]) ??
      null;
  
    return {
      calories: round1(calories),
      protein: round1(protein),
      sugar: round1(sugar),
      totalFat: round1(totalFat),
      carbs: round1(carbs),
      fiber: round1(fiber),
      sodium: round1(sodium),
    };
}
  
function getBetterSearchResults(foods, query) {
    const q = (query || "").toLowerCase().trim();
  
    function scoreFood(f) {
      const desc = (f.description || "").toLowerCase();
      const brand = (f.brandOwner || "").toLowerCase();
      const type = (f.dataType || "").toLowerCase();
  
      let score = 0;
  
      // Prefer familiar data types
      if (type.includes("branded")) score += 40;
      if (type.includes("foundation")) score += 25;
      if (type.includes("survey")) score += 15;
  
      // Prefer known brands
      if (brand) score += 15;
  
      // Prefer shorter, cleaner names
      if (desc.length < 50) score += 10;
  
      // Boost query word matches
      const words = q.split(/\s+/).filter(Boolean);
      for (const w of words) {
        if (w.length >= 3 && desc.includes(w)) score += 5;
      }
  
      return score;
    }
  
    return (foods || []).sort((a, b) => scoreFood(b) - scoreFood(a));
}
  

// ====== CATEGORY DETECTION ======
function detectCategory(descriptionText) {
    const d = (descriptionText || "").toLowerCase();
  
    // Helper: word-boundary-ish match (reduces weird substring hits)
    const has = (word) => new RegExp(`\\b${word}\\b`, "i").test(d);
  
    // 1) Dessert first (so “cola cake” doesn't become soda)
    if (
      has("cake") || has("brownie") || has("cupcake") || has("frosting") ||
      has("dessert") || has("pie") || has("pastry") || has("muffin") ||
      (has("chocolate") && has("cake"))
    ) return "dessert";
  
    // 2) Ice cream
    if (d.includes("ice cream") || has("gelato")) return "ice_cream";
  
    // 3) Cookies/baked sweets
    if (has("cookie") || has("biscuit") || has("cracker")) return "cookies";
  
    // 4) Chips/salty crunch
    if (has("chips") || has("crisps") || d.includes("tortilla chip") || d.includes("potato chip"))
      return "chips";
  
    // 5) Bars
    if (d.includes("protein bar") || d.includes("energy bar") || d.includes("granola bar"))
      return "energy_bar";
  
    // 6) Candy/chocolate (general)
    if (has("candy") || has("chocolate")) return "chocolate_candy";
  
    // 7) Drinks LAST
    // Only call it soda if it truly looks like a drink
   // 7) Drinks LAST
// Catch common soda terms + brand names
if (
    has("soda") || has("cola") || has("coke") || has("coca-cola") || has("pepsi") || d.includes("soft drink") || has("beverage") ||
    has("drink")
  ) return "soda";
  
    return "other";
}
  

// ====== UI HELPERS ======
function setStatus(msg) {
  els.status.textContent = msg;
}

function clearSections() {
    els.mainRow.classList.add("hidden");
    els.foodDetails.classList.add("hidden");
  
    // Clear content
    els.resultsList.innerHTML = "";
    els.foodDetails.innerHTML = "";
    els.swapResults.innerHTML = "";
  
    // Remove pagination if present
    //const existing = document.getElementById("pagination");
    //if (existing) existing.remove();
    const paginationEl = document.getElementById("pagination");
    if (paginationEl) paginationEl.innerHTML = "";

}  
function getAllNutrients(food) {
    const list = food?.foodNutrients || [];
  
    // Convert to a clean list we can display
    const cleaned = list
      .map((n) => {
        const name = n?.nutrient?.name || null;
        const unit = n?.nutrient?.unitName || n?.nutrient?.unit_name || null;
        const amount = n?.amount ?? null;
  
        if (!name || amount === null || amount === undefined) return null;
  
        return {
          name,
          amount: round1(Number(amount)),
          unit: unit || "",
        };
      })
      .filter(Boolean);
  
    // Sort alphabetically (or we can sort by amount later)
    cleaned.sort((a, b) => a.name.localeCompare(b.name));
    return cleaned;
}
function showSnackNutrition(foodFull) {
    // Remove any existing snack nutrition card
    const existing = document.getElementById("snackNutritionCard");
    if (existing) existing.remove();
  
    // Build a container
    const wrapper = document.createElement("div");
    wrapper.id = "snackNutritionCard";
    wrapper.className = "card";
    wrapper.style.marginTop = "14px";
  
    wrapper.innerHTML = `
      <h2>Snack Nutrition</h2>
      ${buildNutritionHtml(foodFull)}
    `;
  
    // Append below the snack results list
    els.searchResults.appendChild(wrapper);
  
    // Scroll to it for better UX
    wrapper.scrollIntoView({ behavior: "smooth", block: "start" });
}
function buildNutritionHtml(foodFull) {
    const n = extractNutrition(foodFull);
    const allNutrients = getAllNutrients(foodFull);
  
    const ingredients =
      foodFull?.ingredients ||
      foodFull?.labelNutrients?.ingredients ||
      null;
  
    const servingSize = foodFull?.servingSize;
    const servingUnit = foodFull?.servingSizeUnit;
    const householdServing = foodFull?.householdServingFullText;
  
    return `
      <p class="small">
        <strong>${foodFull.description || "Food item"}</strong>
        ${foodFull.brandOwner ? ` • ${foodFull.brandOwner}` : ""}
      </p>
  
      <div class="card">
        <h3>Serving</h3>
        <div class="small">
          ${householdServing ? `<div><strong>Household:</strong> ${householdServing}</div>` : ""}
          ${
            servingSize
              ? `<div><strong>Serving size:</strong> ${servingSize} ${servingUnit || ""}</div>`
              : `<div><strong>Serving size:</strong> —</div>`
          }
          <div class="hint">USDA records may be per 100g or per serving depending on the item.</div>
        </div>
      </div>
  
      <div class="card">
        <h3>Ingredients</h3>
        ${
          ingredients
            ? `<div class="small" style="white-space: pre-wrap;">${ingredients}</div>`
            : `<div class="small">Ingredients not available for this USDA record.</div>`
        }
      </div>
  
      <div class="card">
        <h3>Key nutrition</h3>
        <div class="grid">
          <div class="kpi"><div><strong>Calories</strong></div><div>${n.calories ?? "—"} kcal</div></div>
          <div class="kpi"><div><strong>Protein</strong></div><div>${n.protein ?? "—"} g</div></div>
          <div class="kpi"><div><strong>Carbs</strong></div><div>${n.carbs ?? "—"} g</div></div>
          <div class="kpi"><div><strong>Total fat</strong></div><div>${n.totalFat ?? "—"} g</div></div>
          <div class="kpi"><div><strong>Sugars</strong></div><div>${n.sugar ?? "—"} g</div></div>
          <div class="kpi"><div><strong>Fiber</strong></div><div>${n.fiber ?? "—"} g</div></div>
          <div class="kpi"><div><strong>Sodium</strong></div><div>${n.sodium ?? "—"} mg</div></div>
        </div>
      </div>
  
      <div class="card">
        <h3>All nutrients (${allNutrients.length})</h3>
        <details>
          <summary>Show / hide full nutrient list</summary>
          <div style="margin-top:10px; max-height: 280px; overflow:auto; border:1px solid #eee; border-radius:10px; padding:10px;">
            <table style="width:100%; border-collapse: collapse;">
              <tbody>
                ${allNutrients.map(x => `
                  <tr>
                    <td style="padding:6px; border-bottom:1px solid #f5f5f5;">${x.name}</td>
                    <td style="padding:6px; border-bottom:1px solid #f5f5f5; text-align:right;">${x.amount ?? "—"} ${x.unit}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    `;
}
function renderNutritionCard(foodFull) {
    els.foodDetails.classList.remove("hidden");
    els.foodDetails.innerHTML = `
      <h2>Nutrition</h2>
      ${buildNutritionHtml(foodFull)}
    `;
}
function clearSwapUISelection() {
    document.querySelectorAll('input[name="swapPick"]').forEach(r => (r.checked = false));
    const feedback = document.getElementById("swapFeedback");
    if (feedback) feedback.innerHTML = "";
    const box = document.getElementById("swapNutritionBox");
    if (box) box.innerHTML = "";
    selectedSwap = null;
    selectedSwapNutrition = null;
}
    

  

// ====== SEARCH RESULTS RENDER ======
function buildNutritionHtml(foodFull) {
    const n = extractNutrition(foodFull);
    const allNutrients = getAllNutrients(foodFull);
  
    const ingredients = foodFull?.ingredients || null;
    const servingSize = foodFull?.servingSize;
    const servingUnit = foodFull?.servingSizeUnit;
    const householdServing = foodFull?.householdServingFullText;
  
    return `
      <div class="card">
        <h3>Nutrition Value</h3>
        <p class="small">
          <strong>${foodFull.description || "Food item"}</strong>
          ${foodFull.brandOwner ? ` • ${foodFull.brandOwner}` : ""}
        </p>
      </div>
  
      <div class="card">
        <h3>Serving</h3>
        <div class="small">
          ${householdServing ? `<div><strong>Household:</strong> ${householdServing}</div>` : ""}
          ${
            servingSize
              ? `<div><strong>Serving size:</strong> ${servingSize} ${servingUnit || ""}</div>`
              : `<div><strong>Serving size:</strong> —</div>`
          }
        </div>
      </div>
  
      <div class="card">
        <h3>Ingredients</h3>
        ${
          ingredients
            ? `<div class="small" style="white-space: pre-wrap;">${ingredients}</div>`
            : `<div class="small">Ingredients not available for this USDA record.</div>`
        }
      </div>
  
      <div class="card">
        <h3>Key nutrition</h3>
        <div class="grid">
          <div class="kpi"><div><strong>Calories</strong></div><div>${n.calories ?? "—"} kcal</div></div>
          <div class="kpi"><div><strong>Protein</strong></div><div>${n.protein ?? "—"} g</div></div>
          <div class="kpi"><div><strong>Carbs</strong></div><div>${n.carbs ?? "—"} g</div></div>
          <div class="kpi"><div><strong>Total fat</strong></div><div>${n.totalFat ?? "—"} g</div></div>
          <div class="kpi"><div><strong>Sugars</strong></div><div>${n.sugar ?? "—"} g</div></div>
          <div class="kpi"><div><strong>Fiber</strong></div><div>${n.fiber ?? "—"} g</div></div>
          <div class="kpi"><div><strong>Sodium</strong></div><div>${n.sodium ?? "—"} mg</div></div>
        </div>
      </div>
  
      <div class="card">
        <h3>All nutrients (${allNutrients.length})</h3>
        <details>
          <summary>Show / hide full nutrient list</summary>
          <div style="margin-top:10px; max-height: 280px; overflow:auto; border:1px solid #eee; border-radius:10px; padding:10px;">
            <table style="width:100%; border-collapse: collapse;">
              <tbody>
                ${allNutrients.map(x => `
                  <tr>
                    <td style="padding:6px; border-bottom:1px solid #f5f5f5;">${x.name}</td>
                    <td style="padding:6px; border-bottom:1px solid #f5f5f5; text-align:right;">${x.amount ?? "—"} ${x.unit}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    `;
}
  
async function handleSwapSelect(swapName) {
    setStatus("Great choice — loading swap nutrition…");
  
    // 1) Show Great Job immediately after selection (no nutrition yet)
    const feedback = document.getElementById("swapFeedback");
    if (feedback) {
      feedback.innerHTML = `
        <div class="card">
          <h3>Great Job! Keep it up.</h3>
          <p class="small">Come back tomorrow for another healthy snack swap</p>
        </div>
      `;
    }
  
    // 2) Show a collapsed expandable container (so nutrition is hidden by default)
    const box = document.getElementById("swapNutritionBox");
    if (box) {
      box.innerHTML = `
        <details>
          <summary><strong>Nutrition value for: ${swapName}</strong></summary>
          <div class="small" style="margin-top:10px;">Loading…</div>
        </details>
      `;
    }
  
    try {
      const data = await usdaSearchFoods(swapName, 10);
      const foods = data.foods || [];
      if (foods.length === 0) {
        if (box) {
          box.innerHTML = `
            <details>
              <summary><strong>Nutrition value for: ${swapName}</strong></summary>
              <div class="small" style="margin-top:10px;">No nutrition found for this swap in USDA. Try another swap.</div>
            </details>
          `;
        }
        setStatus("No nutrition found for that swap.");
        return;
      }
  
      const top = foods[0];
      const full = await usdaGetFood(top.fdcId);
  
      // Put the nutrition inside the expandable content
      if (box) {
        box.innerHTML = `
          <details>
            <summary><strong>Nutrition value for: ${swapName}</strong></summary>
            <div style="margin-top:12px;">
              ${buildNutritionHtml(full)}
            </div>
          </details>
        `;
      }
  
      setStatus("Swap selected. Expand Nutrition to view details.");
    } catch (err) {
      console.error(err);
      if (box) {
        box.innerHTML = `
          <details>
            <summary><strong>Nutrition value for: ${swapName}</strong></summary>
            <div class="small" style="margin-top:10px;">Could not load nutrition. Try another swap.</div>
          </details>
        `;
      }
      setStatus("Could not load swap nutrition.");
    }
}

function renderSwapList(category) {
    els.mainRow.classList.remove("hidden");
  
    const swaps = SWAPS_BY_CATEGORY[category] || SWAPS_BY_CATEGORY.other;
    const message = CATEGORY_COPY[category] || CATEGORY_COPY.other;
  
    els.swapResults.classList.remove("hidden");
    els.swapResults.innerHTML = `
      <h2>Healthier swaps</h2>
      <p class="small">${message}</p>
      <p class="hint"><strong>Select a healthy swap of your choice.</strong></p>
  
      <div class="swapList">
        ${swaps.map((s) => `
          <label class="swapItem">
            <input type="radio" name="swapPick" value="${String(s).replace(/"/g, "&quot;")}" />
            <span>${s}</span>
          </label>
        `).join("")}
      </div>
  
      <!-- Appears only AFTER user selects a swap -->
      <div id="swapFeedback" style="margin-top:12px;"></div>
      <div id="swapNutritionBox" style="margin-top:12px;"></div>
    `;
  
    els.swapResults.querySelectorAll('input[name="swapPick"]').forEach((input) => {
      input.addEventListener("change", (e) => {
        handleSwapSelect(e.target.value);
      });
    });
}  
  
function renderSearchResults(foods) {
    els.searchResults.classList.remove("hidden");
    els.resultsList.innerHTML = "";
  
    foods.forEach((f) => {
      const li = document.createElement("li");
  
      const title = document.createElement("div");
      title.textContent = f.description || "Unknown food";
  
      const meta = document.createElement("div");
      meta.className = "small";
  
      const brand = f.brandOwner ? `Brand: ${f.brandOwner}` : "Brand: —";
      const type = f.dataType ? `Type: ${f.dataType}` : "Type: —";
      const category = f.foodCategory ? `Category: ${f.foodCategory}` : "Category: —";
      const ingredients = f.ingredients
        ? `Ingredients: ${f.ingredients.substring(0, 80)}...`
        : "Ingredients: —";
  
      meta.innerHTML = `
        ${brand} <br>
        ${type} <br>
        ${category} <br>
        ${ingredients}
      `;
  
      const btn = document.createElement("button");
      btn.textContent = "Show Details";
      btn.style.marginTop = "6px";
  
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        clearSwapUISelection();
        setStatus("Loading snack nutrition…");
      
        try {
          const foodFull = await usdaGetFood(f.fdcId);
          selectedFood = foodFull;
      
          // show nutrition under Snacks Found column
          showSnackNutrition(foodFull);
      
          setStatus("Snack nutrition loaded.");
        } catch (err) {
          console.error(err);
          setStatus("Failed to load snack nutrition. Try another result.");
        } finally {
          btn.disabled = false;
        }
    });
  
      li.appendChild(title);
      li.appendChild(meta);
      li.appendChild(btn);
      els.resultsList.appendChild(li);
    });
  
    renderPagination();
}

function renderPagination() {
    const total = lastSearchResults.length;
    const totalPages = Math.ceil(total / RESULTS_PER_PAGE);
  
    const paginationEl = document.getElementById("pagination");
    if (!paginationEl) return;
  
    // Clear existing pagination UI
    paginationEl.innerHTML = "";
  
    if (totalPages <= 1) return;
  
    // Prev
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Prev";
    prev.disabled = currentPage === 0;
    prev.addEventListener("click", () => goToPage(currentPage - 1));
    paginationEl.appendChild(prev);
  
    // Page window
    const windowSize = 5;
    let start = Math.max(0, currentPage - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize);
    start = Math.max(0, end - windowSize);
  
    for (let i = start; i < end; i++) {
      const pageBtn = document.createElement("button");
      pageBtn.type = "button";
      pageBtn.textContent = String(i + 1);
      pageBtn.className = i === currentPage ? "page active" : "page";
      pageBtn.addEventListener("click", () => goToPage(i));
      paginationEl.appendChild(pageBtn);
    }
  
    // Next
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = currentPage >= totalPages - 1;
    next.addEventListener("click", () => goToPage(currentPage + 1));
    paginationEl.appendChild(next);
}
  
function goToPage(pageIndex) {
    const totalPages = Math.ceil(lastSearchResults.length / RESULTS_PER_PAGE);
    currentPage = Math.min(Math.max(0, pageIndex), totalPages - 1);
  
    const pageFoods = lastSearchResults.slice(
      currentPage * RESULTS_PER_PAGE,
      (currentPage + 1) * RESULTS_PER_PAGE
    );
  
    renderSearchResults(pageFoods);
}
  
  

// ====== MAIN ACTION ======
els.searchForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // prevents page reload
  
    const q = els.query.value.trim();
    if (!q) return setStatus("Type a food name first (e.g., chips).");
  
    clearSections();
    selectedFood = null;
  
    const category = detectCategory(q);
    renderSwapList(category);
  
    setStatus("Searching USDA…");
  
    try {
      const data = await usdaSearchFoods(q, 50);
      lastSearchResults = getBetterSearchResults(data.foods || [], q);
      currentPage = 0;
  
      const foods = lastSearchResults.slice(0, RESULTS_PER_PAGE);
  
      if (lastSearchResults.length === 0) {
        setStatus("No results. Try another search term.");
        return;
      }
  
      setStatus(`Found ${lastSearchResults.length} results. Showing top 10.`);
      renderSearchResults(foods);
    } catch (err) {
      console.error(err);
      setStatus("Search failed. Check your API key and internet, then try again.");
    }
});
  
