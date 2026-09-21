require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

// ============================================================
// CONFIGURATION
// ============================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 5000;

if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN is missing from .env");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
bot.use(async (ctx, next) => {
    console.log("========== TELEGRAM UPDATE ==========");
    console.log("TYPE:", ctx.updateType);
    console.log("TEXT:", ctx.message?.text);
    console.log("CALLBACK:", ctx.callbackQuery?.data);
    console.log("=====================================");
    
    return next();
});

const app = express();

app.use(cors());
app.use(express.json());

// ============================================================
// DATABASE
// ============================================================

const DB_FILE = path.join(__dirname, "database.json");

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const initialDatabase = {
            users: [],
            products: [],
            nextProductId: 1
        };

        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(initialDatabase, null, 2)
        );

        return initialDatabase;
    }

    try {
        return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch (error) {
        console.error("Database error:", error);

        return {
            users: [],
            products: [],
            nextProductId: 1
        };
    }
}

let db = loadDatabase();

function saveDatabase() {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(db, null, 2)
    );
}

// ============================================================
// USER SESSIONS
// ============================================================

const sessions = new Map();

function getSession(userId) {
    if (!sessions.has(userId)) {
        sessions.set(userId, {
            step: null,
            product: {}
        });
    }

    return sessions.get(userId);
}

function clearSession(userId) {
    sessions.delete(userId);
}

// ============================================================
// CATEGORIES
// ============================================================

const categories = {
    electronics: {
        name: "📱 Electronics",
        types: [
            "Phones",
            "Laptops & Computers",
            "TV & Home Entertainment",
            "Cameras",
            "Audio & Headphones",
            "Smart Watches",
            "Gaming",
            "Accessories",
            "Other Electronics"
        ]
    },

    vehicles: {
        name: "🚗 Vehicles",
        types: [
            "Cars",
            "Motorcycles",
            "Bicycles",
            "Trucks",
            "Buses",
            "Vehicle Parts",
            "Vehicle Accessories",
            "Other Vehicles"
        ]
    },

    property: {
        name: "🏠 Property",
        types: [
            "Houses",
            "Apartments",
            "Land",
            "Commercial Buildings",
            "Offices",
            "Shops",
            "Rooms",
            "Other Property"
        ]
    },

    fashion: {
        name: "👕 Fashion",
        types: [
            "Men's Clothing",
            "Women's Clothing",
            "Children's Clothing",
            "Shoes",
            "Bags",
            "Watches",
            "Jewelry",
            "Accessories"
        ]
    },

    home: {
        name: "🛋️ Home & Furniture",
        types: [
            "Furniture",
            "Kitchen",
            "Bedroom",
            "Decoration",
            "Appliances",
            "Lighting",
            "Garden",
            "Other Home Items"
        ]
    },

    computers: {
        name: "💻 Computers",
        types: [
            "Desktop Computers",
            "Laptops",
            "Monitors",
            "Printers",
            "Computer Parts",
            "Networking",
            "Software",
            "Accessories"
        ]
    },

    agriculture: {
        name: "🌾 Agriculture",
        types: [
            "Crops",
            "Seeds",
            "Livestock",
            "Poultry",
            "Farm Equipment",
            "Fertilizer",
            "Agricultural Tools",
            "Other Agriculture"
        ]
    },

    phones: {
        name: "📲 Phones & Tablets",
        types: [
            "iPhone",
            "Samsung",
            "Tecno",
            "Infinix",
            "Xiaomi",
            "Other Android",
            "Tablets",
            "Phone Accessories"
        ]
    },

    jobs: {
        name: "💼 Jobs & Services",
        types: [
            "Jobs",
            "Freelance",
            "Digital Services",
            "Repair Services",
            "Construction",
            "Transportation",
            "Education",
            "Other Services"
        ]
    },

    beauty: {
        name: "💄 Beauty & Personal Care",
        types: [
            "Cosmetics",
            "Perfumes",
            "Skincare",
            "Hair Products",
            "Salon Equipment",
            "Personal Care",
            "Other Beauty"
        ]
    },

    books: {
        name: "📚 Books & Education",
        types: [
            "Books",
            "School Materials",
            "University Materials",
            "Courses",
            "Office Supplies",
            "Educational Equipment"
        ]
    },

    sports: {
        name: "⚽ Sports & Fitness",
        types: [
            "Gym Equipment",
            "Football",
            "Basketball",
            "Running",
            "Cycling",
            "Sports Clothing",
            "Other Sports"
        ]
    },

    other: {
        name: "📦 Other",
        types: [
            "Other Products"
        ]
    }
};

// ============================================================
// MAIN MENU
// ============================================================

function mainMenu() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback("🛍️ Buy", "BUY"),
            Markup.button.callback("🏪 Sell", "SELL")
        ],
        [
            Markup.button.callback("🔎 Search", "SEARCH"),
            Markup.button.callback("📦 My Products", "MY_PRODUCTS")
        ],
        [
            Markup.button.callback("❓ Help", "HELP")
        ]
    ]);
}

// ============================================================
// CATEGORY KEYBOARD
// ============================================================

function categoryKeyboard(prefix = "CATEGORY") {
    const buttons = [];

    for (const [key, category] of Object.entries(categories)) {
        buttons.push(
            Markup.button.callback(
                category.name,
                `${prefix}_${key}`
            )
        );
    }

    const rows = [];

    for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2));
    }

    rows.push([
        Markup.button.callback("⬅️ Main Menu", "MAIN_MENU")
    ]);

    return Markup.inlineKeyboard(rows);
}

// ============================================================
// /START
// ============================================================

bot.start(async (ctx) => {
    const user = ctx.from;

    // Save/update user
    const existingUser = db.users.find(
        u => u.telegramId === user.id
    );

    if (!existingUser) {
        db.users.push({
            telegramId: user.id,
            firstName: user.first_name || "",
            username: user.username || "",
            createdAt: new Date().toISOString()
        });

        saveDatabase();
    }

    clearSession(user.id);

    await ctx.reply(
        `👋 Welcome to Merchant Bot, ${user.first_name || "there"}!

🛍️ Buy products
🏪 Sell your products
🔎 Search the marketplace

Choose what you want to do:`,
        mainMenu()
    );
});

// ============================================================
// MAIN MENU CALLBACK
// ============================================================

bot.action("MAIN_MENU", async (ctx) => {
    await ctx.answerCbQuery();

    clearSession(ctx.from.id);

    await ctx.editMessageText(
        "🏪 *Merchant Marketplace*\n\nChoose an option:",
        {
            parse_mode: "Markdown",
            ...mainMenu()
        }
    );
});

// ============================================================
// BUY
// ============================================================

bot.action("BUY", async (ctx) => {
    await ctx.answerCbQuery();

    await ctx.editMessageText(
        "🛍️ *Shop*\n\nChoose a category:",
        {
            parse_mode: "Markdown",
            ...categoryKeyboard("BUY_CATEGORY")
        }
    );
});

// ============================================================
// BUY CATEGORY
// ============================================================

for (const categoryKey of Object.keys(categories)) {

    bot.action(`BUY_CATEGORY_${categoryKey}`, async (ctx) => {

        await ctx.answerCbQuery();

        const category = categories[categoryKey];

        const buttons = category.types.map((type, index) => {

            return [
                Markup.button.callback(
                    `🔹 ${type}`,
                    `VIEW_${categoryKey}_${index}`
                )
            ];

        });

        buttons.push([
            Markup.button.callback(
                "⬅️ Categories",
                "BUY"
            )
        ]);

        await ctx.editMessageText(
            `${category.name}\n\nChoose a type:`,
            Markup.inlineKeyboard(buttons)
        );
    });
}

// ============================================================
// VIEW PRODUCTS BY TYPE
// ============================================================

for (const categoryKey of Object.keys(categories)) {

    categories[categoryKey].types.forEach((type, index) => {

        bot.action(`VIEW_${categoryKey}_${index}`, async (ctx) => {

            await ctx.answerCbQuery();

            const products = db.products.filter(
                product =>
                    product.category === categoryKey &&
                    product.type === type &&
                    product.status === "active"
            );

            if (products.length === 0) {

                await ctx.editMessageText(
                    `😕 No products found in:\n\n${type}\n\nBe the first seller to list one!`,
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                "🏪 Sell Something",
                                "SELL"
                            )
                        ],
                        [
                            Markup.button.callback(
                                "⬅️ Categories",
                                "BUY"
                            )
                        ]
                    ])
                );

                return;
            }

            const buttons = products
                .slice(0, 30)
                .map(product => [
                    Markup.button.callback(
                        `${product.name} — ${product.price} ETB`,
                        `PRODUCT_${product.id}`
                    )
                ]);

            buttons.push([
                Markup.button.callback(
                    "⬅️ Categories",
                    "BUY"
                )
            ]);

            await ctx.editMessageText(
                `🛍️ *${type}*\n\n${products.length} product(s) found:`,
                {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard(buttons)
                }
            );
        });

    });
}

// ============================================================
// PRODUCT DETAILS
// ============================================================

bot.action(/^PRODUCT_(\d+)$/, async (ctx) => {

    await ctx.answerCbQuery();

    const productId = Number(ctx.match[1]);

    const product = db.products.find(
        p => p.id === productId
    );

    if (!product) {
        await ctx.reply("❌ Product not found.");
        return;
    }

    const seller = db.users.find(
        u => u.telegramId === product.sellerId
    );

    const sellerName =
        seller?.firstName ||
        "Seller";

    const sellerUsername =
        seller?.username;

    let message = `
🛍️ *${product.name}*

📂 Category: ${categories[product.category]?.name || product.category}
🔹 Type: ${product.type}

💰 Price: *${product.price} ETB*

📦 Condition: ${product.condition}

📍 Location: ${product.location}

📝 Description:
${product.description}

👤 Seller: ${sellerName}
`;

    const buttons = [];

    if (sellerUsername) {

        buttons.push([
            Markup.button.url(
                "💬 Contact Seller",
                `https://t.me/${sellerUsername}`
            )
        ]);

    } else {

        buttons.push([
            Markup.button.url(
                "💬 Contact Seller",
                `tg://user?id=${product.sellerId}`
            )
        ]);

    }

    buttons.push([
        Markup.button.callback(
            "⬅️ Back",
            `BACK_TYPE_${product.category}_${encodeURIComponent(product.type)}`
        )
    ]);

    if (product.photo) {

        await ctx.replyWithPhoto(
            product.photo,
            {
                caption: message,
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard(buttons)
            }
        );

    } else {

        await ctx.reply(
            message,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard(buttons)
            }
        );
    }

});

// ============================================================
// BACK TO PRODUCT TYPE
// ============================================================

bot.action(/^BACK_TYPE_(.+)_(.+)$/, async (ctx) => {

    await ctx.answerCbQuery();

    const categoryKey = ctx.match[1];
    const type = decodeURIComponent(ctx.match[2]);

    const products = db.products.filter(
        product =>
            product.category === categoryKey &&
            product.type === type &&
            product.status === "active"
    );

    if (products.length === 0) {
        await ctx.reply("No products found.");
        return;
    }

    const buttons = products
        .slice(0, 30)
        .map(product => [
            Markup.button.callback(
                `${product.name} — ${product.price} ETB`,
                `PRODUCT_${product.id}`
            )
        ]);

    buttons.push([
        Markup.button.callback(
            "⬅️ Categories",
            "BUY"
        )
    ]);

    await ctx.editMessageText(
        `🛍️ *${type}*`,
        {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard(buttons)
        }
    );
});

// ============================================================
// SELL
// ============================================================

bot.action("SELL", async (ctx) => {

    await ctx.answerCbQuery();

    const session = getSession(ctx.from.id);

    session.step = "SELL_CATEGORY";
    session.product = {};

    await ctx.editMessageText(
        "🏪 *Sell a Product*\n\nChoose your product category:",
        {
            parse_mode: "Markdown",
            ...categoryKeyboard("SELL_CATEGORY")
        }
    );
});

// ============================================================
// SELL CATEGORY
// ============================================================

for (const categoryKey of Object.keys(categories)) {

    bot.action(`SELL_CATEGORY_${categoryKey}`, async (ctx) => {

        await ctx.answerCbQuery();

        const session = getSession(ctx.from.id);

        session.product.category = categoryKey;
        session.step = "SELL_TYPE";

        const category = categories[categoryKey];

        const buttons = category.types.map((type, index) => {

            return [
                Markup.button.callback(
                    `🔹 ${type}`,
                    `SELL_TYPE_${categoryKey}_${index}`
                )
            ];

        });

        buttons.push([
            Markup.button.callback(
                "❌ Cancel",
                "CANCEL"
            )
        ]);

        await ctx.editMessageText(
            `${category.name}\n\nWhat type is your product?`,
            Markup.inlineKeyboard(buttons)
        );
    });
}

// ============================================================
// SELL TYPE
// ============================================================

for (const categoryKey of Object.keys(categories)) {

    categories[categoryKey].types.forEach((type, index) => {

        bot.action(`SELL_TYPE_${categoryKey}_${index}`, async (ctx) => {

            await ctx.answerCbQuery();

            const session = getSession(ctx.from.id);

            session.product.type = type;
            session.step = "SELL_NAME";

            await ctx.editMessageText(
                "✏️ *Step 1/7*\n\nWhat is the name of your product?\n\nExample:\n`iPhone 13 Pro`",
                {
                    parse_mode: "Markdown"
                }
            );
        });

    });
}

// ============================================================
// TEXT INPUT HANDLER
// ============================================================

bot.on("text", async (ctx) => {

    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    // Ignore commands
    if (text.startsWith("/")) {
        return;
    }

    const session = getSession(userId);

    // --------------------------------------------------------
    // PRODUCT NAME
    // --------------------------------------------------------

    if (session.step === "SELL_NAME") {

        if (text.length < 2) {
            await ctx.reply(
                "❌ Product name is too short. Please enter a proper name."
            );
            return;
        }

        session.product.name = text;
        session.step = "SELL_PRICE";

        await ctx.reply(
            "💰 *Step 2/7*\n\nEnter the price in ETB.\n\nExample:\n`45000`",
            {
                parse_mode: "Markdown"
            }
        );

        return;
    }

    // --------------------------------------------------------
    // PRICE
    // --------------------------------------------------------

    if (session.step === "SELL_PRICE") {

        const price = Number(
            text.replace(/,/g, "")
        );

        if (!Number.isFinite(price) || price <= 0) {

            await ctx.reply(
                "❌ Please enter a valid price.\n\nExample: `45000`",
                {
                    parse_mode: "Markdown"
                }
            );

            return;
        }

        session.product.price = price;
        session.step = "SELL_CONDITION";

        await ctx.reply(
            "📦 *Step 3/7*\n\nWhat is the condition?",
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "🆕 New",
                        "CONDITION_NEW"
                    ),
                    Markup.button.callback(
                        "♻️ Used",
                        "CONDITION_USED"
                    )
                ],
                [
                    Markup.button.callback(
                        "🔧 Refurbished",
                        "CONDITION_REFURBISHED"
                    )
                ],
                [
                    Markup.button.callback(
                        "❌ Cancel",
                        "CANCEL"
                    )
                ]
            ])
        );

        return;
    }

    // --------------------------------------------------------
    // LOCATION
    // --------------------------------------------------------

    if (session.step === "SELL_LOCATION") {

        if (text.length < 2) {
            await ctx.reply(
                "❌ Please enter a valid location."
            );
            return;
        }

        session.product.location = text;
        session.step = "SELL_DESCRIPTION";

        await ctx.reply(
            "📝 *Step 6/7*\n\nDescribe your product.\n\nInclude important information such as condition, model, defects, included accessories, etc.",
            {
                parse_mode: "Markdown"
            }
        );

        return;
    }

    // --------------------------------------------------------
    // DESCRIPTION
    // --------------------------------------------------------

    if (session.step === "SELL_DESCRIPTION") {

        session.product.description = text;
        session.step = "SELL_PHOTO";

        await ctx.reply(
            "📸 *Step 7/7*\n\nNow send me a photo of your product.\n\nA good product photo helps buyers understand what you're selling.",
            {
                parse_mode: "Markdown"
            }
        );

        return;
    }

    // --------------------------------------------------------
    // SEARCH
    // --------------------------------------------------------

    if (session.step === "SEARCH") {

        const searchText = text.toLowerCase();

        const products = db.products.filter(product => {

            if (product.status !== "active") {
                return false;
            }

            return (
                product.name.toLowerCase().includes(searchText) ||
                product.type.toLowerCase().includes(searchText) ||
                product.category.toLowerCase().includes(searchText) ||
                product.description.toLowerCase().includes(searchText) ||
                product.location.toLowerCase().includes(searchText)
            );
        });

        if (products.length === 0) {

            await ctx.reply(
                `😕 No products found for "${text}".`,
                mainMenu()
            );

            clearSession(userId);

            return;
        }

        const buttons = products
            .slice(0, 30)
            .map(product => [
                Markup.button.callback(
                    `${product.name} — ${product.price} ETB`,
                    `PRODUCT_${product.id}`
                )
            ]);

        buttons.push([
            Markup.button.callback(
                "⬅️ Main Menu",
                "MAIN_MENU"
            )
        ]);

        await ctx.reply(
            `🔎 Search results for "${text}":\n\nFound ${products.length} product(s).`,
            Markup.inlineKeyboard(buttons)
        );

        clearSession(userId);

        return;
    }

    // --------------------------------------------------------
    // DEFAULT
    // --------------------------------------------------------

    await ctx.reply(
        "Please use the buttons below:",
        mainMenu()
    );
});

// ============================================================
// CONDITION BUTTONS
// ============================================================

bot.action("CONDITION_NEW", async (ctx) => {

    await ctx.answerCbQuery();

    const session = getSession(ctx.from.id);

    session.product.condition = "New";
    session.step = "SELL_LOCATION";

    await ctx.editMessageText(
        "📍 *Step 5/7*\n\nWhere is the product located?\n\nExample:\n`Bahir Dar, Amhara`",
        {
            parse_mode: "Markdown"
        }
    );
});

bot.action("CONDITION_USED", async (ctx) => {

    await ctx.answerCbQuery();

    const session = getSession(ctx.from.id);

    session.product.condition = "Used";
    session.step = "SELL_LOCATION";

    await ctx.editMessageText(
        "📍 *Step 5/7*\n\nWhere is the product located?\n\nExample:\n`Bahir Dar, Amhara`",
        {
            parse_mode: "Markdown"
        }
    );
});

bot.action("CONDITION_REFURBISHED", async (ctx) => {

    await ctx.answerCbQuery();

    const session = getSession(ctx.from.id);

    session.product.condition = "Refurbished";
    session.step = "SELL_LOCATION";

    await ctx.editMessageText(
        "📍 *Step 5/7*\n\nWhere is the product located?\n\nExample:\n`Bahir Dar, Amhara`",
        {
            parse_mode: "Markdown"
        }
    );
});

// ============================================================
// PHOTO HANDLER
// ============================================================

bot.on("photo", async (ctx) => {

    const userId = ctx.from.id;
    const session = getSession(userId);

    if (session.step !== "SELL_PHOTO") {

        await ctx.reply(
            "📸 I received your photo, but you're not currently adding a product."
        );

        return;
    }

    const photos = ctx.message.photo;

    const largestPhoto =
        photos[photos.length - 1];

    session.product.photo =
        largestPhoto.file_id;

    // Create product
    const product = {
        id: db.nextProductId++,
        sellerId: userId,
        name: session.product.name,
        category: session.product.category,
        type: session.product.type,
        price: session.product.price,
        condition: session.product.condition,
        location: session.product.location,
        description: session.product.description,
        photo: session.product.photo,
        status: "active",
        createdAt: new Date().toISOString()
    };

    db.products.push(product);

    saveDatabase();

    clearSession(userId);

    await ctx.reply(
        `🎉 *Product Published!*

🛍️ ${product.name}

💰 ${product.price} ETB
📂 ${categories[product.category].name}
🔹 ${product.type}
📦 ${product.condition}
📍 ${product.location}

Your product is now available to buyers.`,
        {
            parse_mode: "Markdown",
            ...mainMenu()
        }
    );
});

// ============================================================
// SEARCH
// ============================================================

bot.action("SEARCH", async (ctx) => {

    await ctx.answerCbQuery();

    const session = getSession(ctx.from.id);

    session.step = "SEARCH";

    await ctx.editMessageText(
        "🔎 *Search Marketplace*\n\nType the product you're looking for.\n\nExample:\n`iPhone`\n`laptop`\n`car`\n`furniture`\n`Bahir Dar`",
        {
            parse_mode: "Markdown"
        }
    );
});

// ============================================================
// MY PRODUCTS
// ============================================================

bot.action("MY_PRODUCTS", async (ctx) => {

    await ctx.answerCbQuery();

    const products = db.products.filter(
        product =>
            product.sellerId === ctx.from.id &&
            product.status === "active"
    );

    if (products.length === 0) {

        await ctx.editMessageText(
            "📦 *My Products*\n\nYou haven't listed any products yet.",
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "➕ Sell Something",
                            "SELL"
                        )
                    ],
                    [
                        Markup.button.callback(
                            "⬅️ Main Menu",
                            "MAIN_MENU"
                        )
                    ]
                ])
            }
        );

        return;
    }

    const buttons = products.map(product => [
        Markup.button.callback(
            `${product.name} — ${product.price} ETB`,
            `MY_PRODUCT_${product.id}`
        )
    ]);

    buttons.push([
        Markup.button.callback(
            "⬅️ Main Menu",
            "MAIN_MENU"
        )
    ]);

    await ctx.editMessageText(
        `📦 *My Products*\n\nYou have ${products.length} active product(s).`,
        {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard(buttons)
        }
    );
});

// ============================================================
// MY PRODUCT DETAILS
// ============================================================

bot.action(/^MY_PRODUCT_(\d+)$/, async (ctx) => {

    await ctx.answerCbQuery();

    const productId = Number(ctx.match[1]);

    const product = db.products.find(
        p =>
            p.id === productId &&
            p.sellerId === ctx.from.id
    );

    if (!product) {

        await ctx.reply(
            "❌ Product not found."
        );

        return;
    }

    await ctx.reply(
        `📦 *${product.name}*

💰 Price: ${product.price} ETB
📂 Category: ${categories[product.category].name}
🔹 Type: ${product.type}
📦 Condition: ${product.condition}
📍 Location: ${product.location}

📝 ${product.description}`,
        {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "🗑️ Delete Product",
                        `DELETE_PRODUCT_${product.id}`
                    )
                ],
                [
                    Markup.button.callback(
                        "⬅️ My Products",
                        "MY_PRODUCTS"
                    )
                ]
            ])
        }
    );
});

// ============================================================
// DELETE PRODUCT
// ============================================================

bot.action(/^DELETE_PRODUCT_(\d+)$/, async (ctx) => {

    await ctx.answerCbQuery();

    const productId = Number(ctx.match[1]);

    const product = db.products.find(
        p =>
            p.id === productId &&
            p.sellerId === ctx.from.id
    );

    if (!product) {

        await ctx.reply(
            "❌ Product not found."
        );

        return;
    }

    product.status = "deleted";

    saveDatabase();

    await ctx.reply(
        `🗑️ "${product.name}" has been removed from the marketplace.`,
        mainMenu()
    );
});

// ============================================================
// CANCEL
// ============================================================

bot.action("CANCEL", async (ctx) => {

    await ctx.answerCbQuery();

    clearSession(ctx.from.id);

    await ctx.editMessageText(
        "❌ Operation cancelled.",
        mainMenu()
    );
});

// ============================================================
// HELP
// ============================================================

bot.action("HELP", async (ctx) => {

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        `❓ *Merchant Bot Help*

🛍️ *Buy*
Browse products by category and type.

🏪 *Sell*
Create a product listing with:
• Product name
• Price
• Condition
• Location
• Description
• Photo

🔎 *Search*
Search the marketplace by product name, category, location, or description.

📦 *My Products*
View and remove your own listings.

💬 *Contact Seller*
Buyers can contact sellers directly through Telegram.`,
        {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "⬅️ Main Menu",
                        "MAIN_MENU"
                    )
                ]
            ])
        }
    );
});

// ============================================================
// COMMANDS
// ============================================================

bot.command("help", async (ctx) => {

    await ctx.reply(
        `❓ Merchant Bot Help

/start - Open the marketplace
/help - Show help
/cancel - Cancel current operation`,
        mainMenu()
    );
});

bot.command("cancel", async (ctx) => {

    clearSession(ctx.from.id);

    await ctx.reply(
        "❌ Operation cancelled.",
        mainMenu()
    );
});

// ============================================================
// EXPRESS SERVER
// ============================================================

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "Merchant Telegram Bot",
        products: db.products.filter(
            p => p.status === "active"
        ).length
    });

});

app.get("/api/products", (req, res) => {

    const products = db.products.filter(
        p => p.status === "active"
    );

    res.json(products);

});

// ============================================================
// START SERVER + TELEGRAM BOT
// ============================================================

async function start() {

    try {

        await bot.launch();

        app.listen(PORT, () => {

            console.log("");
            console.log("=================================");
            console.log("🏪 MERCHANT BOT IS RUNNING");
            console.log("=================================");
            console.log(`🤖 Telegram bot: ONLINE`);
            console.log(`🌐 Backend: http://localhost:${PORT}`);
            console.log(`📦 Products: ${db.products.length}`);
            console.log("=================================");
            console.log("");

        });

    } catch (error) {

        console.error("❌ Failed to start bot:");
        console.error(error);

    }
}

// ============================================================
// SAFE SHUTDOWN
// ============================================================

process.once("SIGINT", () => {
    bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
    bot.stop("SIGTERM");
});

// ============================================================
// START
// ============================================================

start();