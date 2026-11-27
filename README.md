# Solana Profit Pal

Build a modern, fast, mobile-friendly web app called Solana Memecoin Profit Checker.

The purpose of this app is to let a user enter a Solana memecoin contract address (CA) and their investment details, then automatically fetch the token's current market data and calculate their current profit/loss and potential value at different market caps.

1. CORE USER FLOW

The user should be able to:

Paste a Solana token Contract Address (CA).

Enter how much SOL they invested.

Enter the market cap at which they bought.

Click Check Profit.

The app automatically fetches:

Current token price

Current market cap

Liquidity

24h price change

Current SOL/USD price

Token name and ticker

Calculate:

Initial investment in USD

Current position value in USD

Current position value in SOL

Profit/loss in USD

Profit/loss in SOL

ROI percentage

Market-cap multiplier

Show potential values if the token reaches:

$100K MC

$250K MC

$500K MC

$1M MC

$5M MC

$10M MC

2. INPUT SECTION

Create a clean card titled:

"Check Your Memecoin Profit"

Fields:

Contract Address

Label:
Solana Contract Address

Placeholder:
Paste token CA

Example:
6bnmecEMPS2iZaxCKuKDNQFvN6NM3kQ1h7MhouNJpump

Add a Paste button that reads the user's clipboard.

Validate that the input looks like a valid Solana address.

Investment Amount

Label:
Amount Invested

Input number.

Add a dropdown:

SOL

USD

If SOL is selected, the user enters the amount of SOL they invested.

Example:

0.54 SOL

If USD is selected, automatically calculate the equivalent SOL using the current SOL/USD price.

Buy Market Cap

Label:

Buy Market Cap

Allow the user to enter values such as:

53K

52.7K

1.2M

Also allow normal numbers.

Provide quick buttons:

$10K $25K $50K $100K $250K $500K $1M

Check Button

Large primary button:

🚀 Check My Profit

Show a loading state:

Fetching live market data...

3. AUTOMATIC MARKET DATA

After the user submits a CA, automatically retrieve current token information using a reliable Solana market-data API.

Prefer:

DexScreener API

Use the token's Solana CA to locate the appropriate trading pair.

Retrieve:

Token name

Token symbol

Token address

Current price USD

Current price SOL

Market cap

FDV

Liquidity

24h volume

24h price change

Pair address

DEX

Pair creation time

If DexScreener does not return a valid pair, show:

"Token data could not be found. Check the CA and try again."

Do not fabricate market data.

4. AUTOMATIC SOL PRICE

Fetch the current SOL/USD price automatically.

Do not make the user manually enter SOL's price.

Display:

SOL Price: $XX.XX

Allow the SOL price to refresh automatically when the user checks the token.

5. PROFIT CALCULATION

Use the following logic.

If the user invests SOL:

Initial USD investment:

SOL invested × SOL price at time of calculation

Market-cap multiplier:

Current Market Cap ÷ Buy Market Cap

Estimated current position value:

Initial USD investment × Market-cap multiplier

Estimated profit:

Current position value − Initial investment

ROI:

((Current position value − Initial investment) ÷ Initial investment) × 100

Current SOL value:

Current USD value ÷ Current SOL price

IMPORTANT:

Clearly label this calculation as an estimated market-cap-based value.

Do not assume the user can actually sell the entire position at that calculated value.

6. MAIN RESULT CARD

After calculation, display a large result card.

Example:

Your Position

Current Value

$71.72

Profit

+$20.34

ROI

+39.6%

Current Value in SOL

0.754 SOL

Market Cap

$74K

Buy Market Cap

$53K

Multiplier

1.40×

Make profit results visually distinct from losses.

If negative:

-$XX.XX

and:

-XX.X%

7. MARKET DATA CARD

Show:

Token

TOKEN NAME ($TICKER)

Current Price

$0.00000...

Market Cap

$74.1K

Liquidity

$XXK

24h Change

+XX.X%

24h Volume

$XXK

SOL Price

$XX.XX

Add a clickable button:

View on DexScreener

Open the corresponding DexScreener pair page.

Also add:

Copy CA

button.

8. PROFIT TARGET CALCULATOR

Create a section:

"What If It Reaches..."

Automatically calculate the user's position at:

| Target MC | Estimated Value | Estimated Profit | ROI |
| $100K | — | — | — |
| $250K | — | — | — |
| $500K | — | — | — |
| $1M | — | — | — |
| $5M | — | — | — |
| $10M | — | — | — |

For example, if:

Buy MC = $53K

Investment = 0.54 SOL

Then at $100K:

Multiplier:

100,000 ÷ 53,000 = 1.887×

Estimated SOL position:

0.54 × 1.887 = 1.019 SOL

Calculate the USD value using the current SOL price.

Make this table update automatically whenever the user changes:

Investment

Buy market cap

SOL price

9. CUSTOM TARGET

Add an input:

Enter Your Target Market Cap

Examples:

$200K

$750K

$2M

After entering it, automatically display:

At $X market cap:

Current investment value:

$XXX

Profit:

+$XXX

ROI:

XXX%

SOL value:

X.XX SOL

10. PRICE / MARKET CAP CHART

Add a simple interactive chart showing:

Market Cap vs Estimated Portfolio Value

X-axis:

Market Cap

Y-axis:

Portfolio Value

Use the user's actual buy market cap as the starting point.

Show target points at:

$100K
$250K
$500K
$1M
$5M
$10M

The chart should update dynamically.

11. IMPORTANT MEMECOIN WARNING

Display a small warning below the results:

⚠️ Estimated Value

"Your estimated profit is calculated using market-cap movement. Actual sell value can be lower because of liquidity, price impact, slippage, trading fees, and changing market conditions."

Also explain:

"Market cap does not equal the amount of money available to sell."

Do not provide financial guarantees or investment recommendations.

12. RECENT CHECKS

Store the user's recent calculations locally in the browser.

Show:

Recent Checks

Each row should contain:

Token ticker

CA shortened

Buy MC

Current MC

Investment

Current estimated value

Profit

Time checked

Example:

TOKEN • 6bnm...pump

Buy: $53K → Now: $74K

0.54 SOL

+$20.34

Allow:

Clear History

Do not require account creation for this feature.

13. AUTO REFRESH

Add a toggle:

Auto Refresh

Options:

Off

30 seconds

60 seconds

5 minutes

When enabled, refresh the token's current market data automatically.

Show:

Last updated: 12 seconds ago

Add:

Refresh Now

button.

14. ERROR HANDLING

Handle:

Invalid CA

Token not found

API unavailable

No liquidity

Multiple trading pairs

Missing market cap

Missing SOL price

Rate limits

Never display fake values.

If market cap is unavailable:

"Current market cap unavailable. Try again shortly."

If liquidity is extremely low, show:

"⚠️ Low liquidity — estimated sell value may differ significantly from displayed value."

15. DESIGN

Use a premium crypto dashboard aesthetic.

Dark mode by default.

Style:

Black/dark charcoal background

Glassmorphism cards

Subtle gradients

Green for profits

Red for losses

Purple/blue accent

Rounded cards

Smooth animations

Clean typography

Responsive layout

The interface should feel similar to a modern crypto analytics dashboard, but do not copy any existing website.

Mobile-first design is extremely important.

16. LANDING PAGE

At the top:

Know Your Memecoin Profit Instantly.

Subtitle:

Paste a Solana CA. Enter your investment. See your estimated profit in seconds.

CTA:

🚀 Check My Profit

Below it show three benefits:

⚡ Live Data

Automatically fetch current token market data.

📈 Instant Profit

Calculate your estimated position value and ROI.

🎯 Target Calculator

See what your investment could be worth at different market caps.

17. API ARCHITECTURE

Do not expose API keys in frontend code.

Use a secure backend/serverless function for API requests where required.

Create a clean service layer:

marketDataService

Functions should include:

getTokenData(ca)

getSolPrice()

getTradingPair(ca)

calculateProfit()

calculateTargetValue()

Keep API logic separate from UI components so the market-data provider can easily be changed later.

18. DATA ACCURACY

The application must distinguish between:

Actual market data

and

Estimated portfolio value.

Current market cap should come from the API.

The app must never calculate current market cap from the user's investment.

The user's investment should only be used to calculate their estimated position value.

If the token's supply changes or the API reports FDV rather than market cap, clearly identify which metric is being displayed.

19. OPTIONAL ADVANCED FEATURE

Add a button:

"Analyze Token"

This can show:

Liquidity

Holder count if available

Pair age

24h volume

Buy/sell activity if available

DEX

Price change

Add a disclaimer:

"This is market-data information, not financial advice."

20. PERFORMANCE

The app should:

Load quickly

Cache token data briefly

Avoid unnecessary API calls

Debounce searches

Handle API rate limits gracefully

Work properly on mobile

Never freeze while fetching data

21. FINAL UX

The entire experience should be:

Paste CA → Enter SOL → Enter Buy MC → Check → Live MC → Profit → Target Calculator

Make the result extremely easy to understand for someone who does not understand crypto calculations.

Do not require login.

Do not require a subscription for the basic calculator.

Build the application with production-quality code and a clean component structure.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://memecoin-profit-tracker.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e3736370-fc68-4641-b8e1-cf0952601e99).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
