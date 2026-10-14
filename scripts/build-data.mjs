import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('../ovia-inspection');
const inventory=JSON.parse(fs.readFileSync('data/inventory.json','utf8'));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function evidence(file,marker,note){const text=read(file);const index=marker?text.indexOf(marker):0;if(index<0)throw Error(`Missing evidence ${file}: ${marker}`);return{file,line:text.slice(0,index).split('\n').length,symbol:marker||undefined,note};}
const C='src/server/commerce.ts',D='src/server/db.ts',H='src/server/http.ts',A='src/server/auth.ts',AD='src/server/admin-service.ts',AA='src/server/admin-auth.ts',V='src/app/api/v1/[[...path]]/route.ts',R='src/server/razorpay-checkout.ts',RF='src/server/razorpay-refunds.ts',L='src/server/logistics.ts',M='src/server/mail.ts',CARE='src/server/care-order-requests.ts',SH='src/lib/shipping/service.ts';
const workflows=[];
const n=(label,category,kind,file,marker,description,status='Implemented',endpoint)=>({label,category,kind,status,description:description||label,evidence:file?[evidence(file,marker)]:[],...(endpoint?{endpoint}: {})});
const front=(label,file,marker,description)=>n(label,'Frontend','Frontend Action',file,marker,description);
const service=(label,file,marker,description)=>n(label,'Backend','Backend Service',file,marker,description);
const query=(label,file,marker,description)=>n(label,'Database','Database Query',file,marker,description);
const gate=(label,file,marker,description)=>n(label,'Backend','IF / Switch',file,marker,description);
const api=(label,file,marker,endpoint,description)=>n(label,'API','HTTP Request',file,marker,description,'Implemented',endpoint);
const external=(label,file,marker,description)=>n(label,'External','External API',file,marker,description+' Runtime configuration and connectivity are Unverified.');
function flow(id,title,subtitle,steps,{notes=[],errorFile=H,errorMarker='export function api',group='Business workflows',errorDescription='Validation, access, conflict or service errors are returned to the caller. Status and error shape depend on the specific route.'}={}){
 const nodes=steps.map((s,i)=>({...s,id:`${id}-n${i}`}));
 const edges=nodes.slice(1).map((v,i)=>({id:`${id}-e${i}`,source:nodes[i].id,target:v.id,...(nodes[i].kind==='IF / Switch'?{label:'Yes / accepted'}:{})}));
 const failure={...n('Request failed','Errors','Error Handler',errorFile,errorMarker,errorDescription),id:`${id}-error`};
 const failEnd={...n('Show error / retry','Errors','Response',errorFile,errorMarker,'Failure end state. Caller receives the actual error; a retry may be offered by the UI.'),id:`${id}-failure-end`};
 const gates=nodes.filter(v=>['IF / Switch','Validation','Authentication'].includes(v.kind));
 for(const v of gates.length?gates:[nodes.find(v=>v.category==='API')||nodes[0]])edges.push({id:`${id}-fail-${v.id}`,source:v.id,target:failure.id,label:v.kind==='IF / Switch'?'No / rejected':'Failure',failure:true});
 edges.push({id:`${id}-fail-end`,source:failure.id,target:failEnd.id,failure:true});
 nodes.push(failure,failEnd);
 nodes[0].kind='Trigger';nodes[nodes.length-3].kind='Response';
 workflows.push({id,title,subtitle,group,nodes,edges,notes:['Source implementation is documented; deployed configuration and provider connectivity are not verified.',...notes]});
 return workflows.at(-1);
}
 flow('01-authentication','User registration & authentication','Password sign-in, email OTP, session creation and social identity',[
 front('Register or sign in','src/components/auth-experience.tsx',null,'Account authentication forms and verification experience.'),
 api('POST authentication',V,'path === "auth/register"','POST /api/v1/auth/register | /login','Registration and login share the dispatcher. Password, email and terms requirements differ.'),
 gate('Valid credentials?',V,'Passwords must match','Zod validation, password policy, duplicate email checks and scrypt password verification.'),
 query('Store / load user',V,'repo.put("users", u)','users: id, email, passwordHash, verification and terms fields.'),
 gate('Email verified?',V,'if (!user.verifiedAt)','Unverified accounts receive an email OTP. Verified accounts proceed to completeSignIn.'),
 service('Issue email verification OTP','src/server/recovery.ts','requestVerificationCode','Generate and hash a one-time verification code with expiration and attempt limits.'),
 external('Resend email delivery',M,'export async function sendAccountEmail','Email provider HTTP call; failures cannot be treated as successful delivery.'),
 service('Complete sign-in','src/server/account-sign-in.ts','completeSignIn','Merge guest cart and account state, then create the session.'),
 query('Persist JWT session',A,'export async function signIn','HS256 JWT in HttpOnly cookie; hashed jti in sessions with userId and expiration.'),
 front('Account authenticated','src/components/auth-experience.tsx',null,'Successful sign-in returns safe user fields and navigates the customer account.')
],{notes:['The OTP delivery and verification nodes apply only to unverified email accounts. The Yes branch below bypasses OTP. Google and Apple use a separate OAuth branch.']});
{
 const w=workflows.at(-1);w.edges=w.edges.filter(e=>!(e.source===w.nodes[4].id&&!e.failure));
 w.edges.push({id:'auth-verified',source:w.nodes[4].id,target:w.nodes[7].id,label:'Yes'});
 w.edges.push({id:'auth-otp',source:w.nodes[4].id,target:w.nodes[5].id,label:'No - verify OTP'});
 w.edges=w.edges.filter(e=>!(e.source===w.nodes[4].id&&e.failure));
 const verify={...service('Consume and verify email OTP','src/server/recovery.ts','export async function verifyEmailCode','Submitted code is compared with the hashed token, checked for expiry and attempt limits, then consumed.'),id:'auth-otp-verify'};
 w.nodes.push(verify);w.edges=w.edges.filter(e=>!(e.source===w.nodes[6].id&&!e.failure));w.edges.push({id:'auth-email-verify',source:w.nodes[6].id,target:verify.id,label:'Customer enters OTP'},{id:'auth-otp-signin',source:verify.id,target:w.nodes[7].id,label:'Valid code'},{id:'auth-otp-reject',source:verify.id,target:'01-authentication-error',label:'Invalid / expired OTP',failure:true});
 const social={...external('Google / Apple OAuth','src/server/social-auth.ts','export async function prepareFlow','State and PKCE flow, code exchange, JWKS identity verification and resolveSocialUser.'),id:'auth-oauth'};
 w.nodes.push(social);w.edges.push({id:'auth-social-start',source:w.nodes[0].id,target:social.id,label:'Social sign-in'},{id:'auth-social-success',source:social.id,target:w.nodes[7].id,label:'Identity verified'},{id:'auth-social-fail',source:social.id,target:'01-authentication-error',label:'Invalid state / token',failure:true});
}
flow('02-catalog','Product & catalog management','Owner-controlled product publishing, taxonomy and index updates',[
 front('Edit product or category','src/components/admin/product-editor.tsx',null,'Owner catalog editor; create, update or remove catalog records.'),
 api('Admin product / category API','src/app/api/admin/products/route.ts','export async function POST','POST /api/admin/products','Category CRUD has its own routes; inspect the API inventory for each method.'),
 n('Authorize store owner','Admin','Authentication',AA,'export async function authorizeAdminApi','JWT session plus normalized OWNER or ADMIN role.'),
 service('Create / update catalog',AD,'export async function createAdminProduct','Server normalizes product data, variants and media. Category records are maintained separately.'),
 query('Products and categories',AD,'export async function createAdminCategory','Persist actual catalog collections; category matching includes name, slug and department logic rather than a declared foreign key.'),
 external('Sync Algolia index','src/lib/algolia.ts','export async function saveAlgoliaProduct','Writes run only when a write key exists. Index errors are logged and are non-blocking.'),
 service('Publication & stock filter',D,'export async function catalog','Storefront excludes unpublished, draft, archived and imported/demo records and overlays inventory balances.'),
 front('Updated storefront catalog','src/components/catalog-view.tsx',null,'Catalog listings display published products and supported facets.')
],{notes:['Algolia synchronization is optional and best effort; successful database writes do not prove the search index was updated.']});
flow('03-search','Product search & filtering','Algolia search and database-backed catalog filtering are distinct paths',[
 front('Enter search or facets','src/components/instant-search-modal.tsx',null,'Instant search modal and catalog filter UI.'),
 api('GET catalog search','src/app/api/search/route.ts','export async function GET','GET /api/search?q=…','Query, limit and page are normalized; the route enforces a ten-second search timeout.'),
 external('Algolia search index','src/lib/algolia.ts','export async function searchAlgoliaProducts','searchSingleIndex queries the configured products index.'),
 front('Search results','src/components/instant-search-modal.tsx',null,'Render returned hits and links to products.')
],{errorFile:'src/app/api/search/route.ts',errorMarker:'} catch',errorDescription:'Unavailable configuration, timeout or provider failure returns HTTP 503.',notes:['GET /api/v1/products and /api/v1/search filter the MongoDB catalog; /api/search uses Algolia.']});
{
 const w=workflows.at(-1);const extra=[api('GET filtered catalog',V,'path === "products"','GET /api/v1/products | /search','Database catalog filtering via filterProducts.'),service('Filter catalog facets','src/lib/catalog-filter.ts','filterProducts','Category, department and other Filters constrain product results.'),query('Read products + stock',D,'export async function catalog','Database catalog and SKU inventory balances.')].map((x,i)=>({...x,id:`search-filter-${i}`}));
 w.nodes.push(...extra);w.edges.push({id:'search-filter-start',source:w.nodes[0].id,target:extra[0].id,label:'Facets'},{id:'search-filter-1',source:extra[0].id,target:extra[2].id},{id:'search-filter-2',source:extra[2].id,target:extra[1].id},{id:'search-filter-results',source:extra[1].id,target:w.nodes[3].id,label:'Filtered products'},{id:'search-filter-error',source:extra[0].id,target:'03-search-error',failure:true,label:'DB unavailable'});
}
flow('04-wishlist-cart','Wishlist & cart management','Account wishlist, guest cart ownership and optimistic version checks',[
 front('Save item / add to bag','src/components/store-provider.tsx',null,'Store provider coordinates catalog, wishlist and cart interactions.'),
 api('Cart mutation',V,'path === "cart/items"','POST /api/v1/cart/items','PATCH and DELETE /api/v1/cart/items/:sku are also implemented.'),
 service('Resolve cart owner',A,'export async function cartOwner','Signed-in user ID or SHA256-hashed guest cookie identifies the cart.'),
 gate('Valid SKU and quantity?',C,'export async function changeCart','Available variant, quantity 0-10 and optional cart version check; stale versions return 409.'),
 query('Persist carts',C,'version: cart.version + 1','Cart contains id, lines[].sku, lines[].quantity and version.'),
 front('Refresh bag totals','src/components/shopping-bag-drawer.tsx',null,'Render server-confirmed line items and totals.')
]);
{
 const w=workflows.at(-1), extra=[api('Account wishlist API','src/app/api/v1/account/wishlist/route.ts','export function POST','POST /api/v1/account/wishlist','GET reads and DELETE removes saved items; authentication required.'),service('Validate saved variant','src/server/account-wishlist.ts','export async function changeAccountWishlist','Validate input and catalog SKU.'),query('users.accountWishlist','src/server/account-wishlist.ts','accountWishlist: next','Wishlist is embedded on users; no standalone wishlist collection is invented.')].map((s,i)=>({...s,id:`wishlist-${i}`}));
 w.nodes.push(...extra);w.edges.push({id:'wishlist-start',source:w.nodes[0].id,target:extra[0].id,label:'Save item'},...extra.slice(1).map((s,i)=>({id:`wishlist-${i}`,source:extra[i].id,target:s.id})),{id:'wishlist-end',source:extra[2].id,target:w.nodes[5].id,label:'Saved wishlist'},{id:'wishlist-fail',source:extra[0].id,target:'04-wishlist-cart-error',failure:true,label:'401 / invalid SKU'});
}
flow('05-checkout','Checkout & address validation','Indian address validation, shipping availability and authoritative pricing',[
 front('Review bag and address','src/app/checkout/page.tsx',null,'Checkout page collects customer address and shipping preferences.'),
 api('Request shipping + quote','src/app/api/v1/checkout/[[...action]]/route.ts','action.join("/") === "quote"','POST /api/v1/checkout/quote','Quote input is strict; origin and rate-limit checks apply.'),
 n('Validate Indian address','Backend','Validation',C,'export const addressSchema','Country IN, six-digit PIN, email, city and region. Checkout input requires a valid Indian mobile number.'),
 external('Delhivery serviceability','src/lib/shipping/delhivery.ts','checkServiceability','Checkout page separately calls shipping/serviceability for the PIN code.'),
 service('Server checkout pricing','src/server/checkout-pricing.ts','checkoutQuote','Price catalog lines, shipping and coupon rules using server records.'),
 query('Cart / coupons / settings','src/server/checkout-pricing.ts','"coupons"','Persisted cart version and current discount data are used to construct the quote.'),
 front('Confirm authoritative total','src/app/checkout/page.tsx',null,'Frontend displays quote and passes quoteId to secure checkout.')
],{notes:['Serviceability is a separate frontend request, not a sequential call inside checkoutQuote. The diagram expresses the checkout interaction, not a single handler stack.']});
flow('06-payments','Payment processing & verification','Razorpay signed verification, provider reconciliation and webhook replay control',[
 front('Launch secure checkout','src/app/checkout/page.tsx',null,'Customer confirms the reviewed quote and starts provider checkout.'),
 api('Create Razorpay session','src/app/api/v1/payments/razorpay/[[...action]]/route.ts','action.join("/") === "sessions"','POST /api/v1/payments/razorpay/sessions','Validate input, owner, origin and rate limits before beginRazorpayCheckout.'),
 service('Create local payment order',R,'export async function beginRazorpayCheckout','createOrder reserves stock and creates a durable order; provider order data is attached.'),
 external('Razorpay Orders API',R,'async function providerRequest','Authenticated provider requests create and retrieve payment orders.'),
 api('POST signed verification','src/app/api/v1/payments/razorpay/[[...action]]/route.ts','action.join("/") === "verify"','POST /api/v1/payments/razorpay/verify','verifyRazorpayPayment validates returned payment identifiers and signature.'),
 gate('Captured payment matches?',R,'function verifyRemotePayment','Amount, currency, remote order identity and capture status must match the local order.'),
 service('Finalize payment',C,'export async function finalizePayment','Duplicate events are checked; timely captures become paid, late captures require refund review.'),
 query('orders + events + outbox',C,'queueOrderConfirmation','Payment metadata remains on orders; event IDs protect replay; confirmation mail is queued only for confirmed purchases.'),
 front('Order confirmation','src/app/orders/[id]/confirmation/page.tsx',null,'Customer receives verified order state, never an assumed successful capture.')
],{notes:['PayPal uses a separate implemented sandbox create/approve/capture flow. Legacy Stripe checkout is guarded to test credentials.']});
{
const w=workflows.at(-1),webhook={...n('Verified payment webhook','API','Webhook','src/app/api/webhooks/[provider]/route.ts','export async function POST','Stripe, Razorpay and PayPal dispatch; signature verification precedes reconciliation.'),id:'payment-webhook'},paypal={...external('PayPal sandbox approval','src/server/paypal-checkout.ts','beginPayPalCheckout','Create sandbox order, redirect approval, capture and verify provider response.'),id:'payment-paypal'};
w.nodes.push(webhook,paypal);w.edges.push({id:'payment-event',source:w.nodes[3].id,target:webhook.id,label:'Provider webhook'},{id:'payment-webhook-final',source:webhook.id,target:w.nodes[6].id,label:'Verified event'},{id:'payment-webhook-fail',source:webhook.id,target:'06-payments-error',label:'Invalid signature',failure:true},{id:'payment-paypal-start',source:w.nodes[0].id,target:paypal.id,label:'PayPal sandbox'},{id:'payment-paypal-final',source:paypal.id,target:w.nodes[6].id,label:'Verified capture'},{id:'payment-paypal-fail',source:paypal.id,target:'06-payments-error',failure:true});
}
flow('07-orders','Order creation & management','Idempotent order records, customer ownership and controlled fulfillment',[
 front('Place or view an order','src/components/account-order-details.tsx',null,'Customer order detail and post-checkout management.'),
 service('Idempotent createOrder',C,'export async function createOrder','Existing owner + idempotencyKey returns the prior compatible order; active checkout is reused.'),
 gate('Quote and stock still valid?',C,'Your bag or pricing changed','Empty carts, changed quoteId, incompatible providers and insufficient stock are rejected.'),
 query('Persist orders',C,'await repo.put("orders", order)','Order contains address, line snapshots, provider IDs, owner, userId and expiry.'),
 api('Read customer order',V,'route[0] === "orders" && route.length === 2','GET /api/v1/orders/:id','Lookup by ID or order number; ownership and allowed staff roles are checked.'),
 gate('Owner or allowed staff?',V,'if (!isOwner && !isStaff)','Unauthorized access returns 403; owner and idempotencyKey fields are removed from public responses.'),
 front('Safe order details','src/components/account-order-details.tsx',null,'Render payment state and courier-verified shipping data.')
]);
flow('08-inventory','Inventory & stock updates','Reservation, expiration release and audited owner adjustments',[
 n('Checkout or expiry trigger','Backend','Trigger',C,'export async function createOrder','Reservation runs within checkout order creation; expiry runs via protected cron.'),
 query('Read SKU balance',C,'type Inventory','inventory.id equals variant SKU; available quantity is loaded or derived from product variants.'),
 gate('Sufficient available stock?',C,'stock.available < line.quantity','Reject overselling with HTTP 409 before updating the order.'),
 query('Reserve stock atomically',C,'available: stock.available - line.quantity','Balance decrement and order insert share the MongoDB transaction.'),
 service('Release expired reservation',C,'export async function expireOrders','Expiry code releases nonfinal inventory once; cancellation has its own release path.'),
 query('Update inventory + order',C,'inventoryReleased','inventoryReleased protects repeated release.'),
 front('Updated availability','src/components/product-detail.tsx',null,'Catalog overlays inventory on variant stock.')
]);
{
const w=workflows.at(-1),adjust={...service('Owner stock adjustment',AD,'export async function adjustInventoryStock','PATCH /api/admin/inventory updates inventory, product variant stock, inventoryMovements and audit.'),id:'inventory-adjust'};w.nodes.push(adjust);w.edges.push({id:'stock-adjust',source:w.nodes[0].id,target:adjust.id,label:'Owner adjustment'},{id:'stock-adjust-end',source:adjust.id,target:w.nodes[6].id},{id:'stock-adjust-fail',source:adjust.id,target:'08-inventory-error',failure:true,label:'Invalid adjustment'});
}
flow('09-shipping','Shipping & delivery tracking','Paid order approval, Delhivery AWB, pickup and authenticated courier events',[
 front('Owner approves shipment','src/app/admin/(control-center)/orders/[id]/page.tsx',null,'Owner reviews order and initiates shipment / pickup.'),
 api('Create shipment','src/app/api/admin/orders/[id]/shipment/route.ts','export async function POST','POST /api/admin/orders/:id/shipment','Authorized owner executes controlled logistics.'),
 gate('Paid and eligible?',L,'Only paid, unrefunded orders','Payment capture, unrefunded state, package data and logistics lease checks prevent unsafe repeated actions.'),
 external('Delhivery shipment + pickup','src/lib/shipping/delhivery.ts','createShipment','Courier API returns AWB and shipment metadata; pickup is requested through the shipping service.'),
 query('orders.shipping',L,'await repo.put("orders", updated)','Shipping data and logistics operation progress are embedded on the order.'),
 n('Courier webhook / refresh','API','Webhook','src/app/api/webhooks/delhivery/route.ts','export async function POST','Courier events are authenticated; refresh route can also reconcile tracking.'),
 service('Normalize courier event',SH,'export async function processShippingWebhook','Match AWB to stored order and map courier status into internal shipping status.'),
 front('Customer tracking timeline','src/components/order-tracking.tsx',null,'Only verified shipment information is shown to customers.')
],{errorFile:L,errorMarker:'courierWriteAttempted',errorDescription:'Ambiguous courier writes are tracked for review instead of falsely declaring shipment success.'});
flow('10-cancellation','Order cancellation','Ownership, cancellation window, courier cancellation and payment reconciliation',[
 front('Confirm cancellation','src/components/account-order-details.tsx',null,'Customer confirms cancellation and optional reason.'),
 api('POST order cancellation',V,'route[2] === "cancel"','POST /api/v1/orders/:id/cancel','Validate owner, deadline and confirmed=true payload.'),
 gate('Cancellation allowed?',V,'The cancellation deadline has passed','Expired deadline rejects the request; logistics checks prevent unsafe cancellation.'),
 service('Lease logistics operation',L,'export function makeLogisticsService','Tracks processing, failed or confirmed phases on the order and audit entries.'),
 external('Cancel Delhivery shipment','src/lib/shipping/delhivery.ts','cancelShipment','Cancel a shipment when present; courier confirmation is required before final reconciliation.'),
 service('Reconcile Razorpay refund',L,'const refund = await deps.refund','Captured Razorpay payment is reconciled through the refund service. Other providers require appropriate review.'),
 query('Release inventory once',L,'inventoryReleased: true','Update order cancellation, stock and audit; errors remain visible on logisticsOperations.cancel.'),
 front('Cancellation outcome','src/components/account-order-details.tsx',null,'Customer sees confirmed or unresolved cancellation and refund status.')
],{errorFile:L,errorMarker:'courierWriteAttempted',notes:['A cancelled order does not itself prove the payment provider has completed a refund.']});
flow('11-returns-exchanges','Returns & exchanges','Implemented request and approval; replacement fulfillment is a proposed extension',[
 front('Choose return / exchange','src/components/product-exchange-form.tsx',null,'Return and exchange forms collect reason, pickup details, items and optional replacement SKU.'),
 api('POST return request','src/app/api/v1/orders/[id]/return/route.ts','export async function POST','POST /api/v1/orders/:id/return','Strict input schema and customerOrder ownership check.'),
 gate('Delivered and within window?','src/app/api/v1/orders/[id]/return/route.ts','A paid, courier-confirmed delivery','Paid courier-confirmed delivery, no active refund and unexpired deadline are required. Exchange validates replacement availability without reserving it.'),
 service('Create care review ticket',CARE,'export async function createCareTicket','Idempotent tickets and support conversation capture the requested order action.'),
 query('tickets + returns decision',AD,'export async function updateReturnStatus','Admin approves or rejects the request; returns stores inspection decision and links ticketId/orderRawId.'),
 front('Request status visible','src/components/account-orders-returns.tsx',null,'Customer can follow the support request; approval does not disburse funds.')
],{notes:['No automatic replacement order creation, replacement stock reservation or reverse pickup execution was found in the reviewed return request and approval paths. Those steps are Planned.']});
{
const w=workflows.at(-1),planned={...n('Arrange replacement fulfillment','Admin','Backend Service',null,null,'Proposed extension: reserve replacement stock, arrange reverse pickup and issue a replacement order after inspection. No implementation mapping is claimed.','Planned'),id:'exchange-planned'};w.nodes.push(planned);w.edges.push({id:'exchange-proposed',source:w.nodes[4].id,target:planned.id,label:'Proposed exchange extension',proposed:true},{id:'exchange-proposed-end',source:planned.id,target:w.nodes[5].id,label:'Proposed outcome',proposed:true});
}
flow('12-refunds','Refund processing','Captured payment verification, refund balance and provider-confirmed result',[
 front('Owner requests refund','src/app/admin/(control-center)/payments/page.tsx',null,'Payments UI verifies provider payment before refunding.'),
 api('POST admin payments','src/app/api/admin/payments/route.ts','export async function POST','POST /api/admin/payments','Owner authorization, origin, rate limit and refund input checks.'),
 gate('Refundable captured payment?',RF,'Only a verified, captured Razorpay','Verify provider capture, currency, amount, remaining refundable balance and idempotent refund identity.'),
 query('Record Processing refund',RF,'refunds: [...(current.refunds || []), created]','Embedded orders.refunds[] and audit entry record the intent before provider execution.'),
 external('Razorpay Refunds API',RF,'`payments/${record.paymentId}/refund`','Gateway may report processed, failed or still processing; ambiguous responses remain unresolved.'),
 n('Signed refund webhook','API','Webhook','src/app/api/webhooks/[provider]/route.ts','export async function POST','Verified Razorpay refund event reaches processRefundWebhook.'),
 service('Reconcile remote refund',RF,'export async function processRefundWebhook','Refund identity, order association, amount and event status are validated.'),
 query('Refunded / Failed / Processing',RF,'refunds: order.refunds!.map','Persist only provider-confirmed status; audit and cancellation reconciliation follow.'),
 front('Provider refund status','src/app/admin/(control-center)/payments/page.tsx',null,'Owner and account views use recorded provider refund status.')
],{notes:['Manual returns approval is separate from gateway refund execution. Automated PayPal and Stripe refund execution was not found; a future implementation is Planned.']});
flow('13-reviews','Reviews & ratings','Authenticated submissions, ownership and order-linked verified purchase evidence',[
 front('Write product review','src/components/product-reviews.tsx',null,'Review UI displays published ratings and submits customer content.'),
 api('Review CRUD','src/app/api/v1/reviews/route.ts','export async function POST','GET / POST / PUT / DELETE /api/v1/reviews','Schemas validate rating, comment, aspect scores and attachment metadata.'),
 n('Authenticate reviewer','Backend','Authentication','src/app/api/v1/reviews/route.ts','currentUser','Mutation requires currentUser; edit and delete enforce author ownership.'),
 service('Check purchase association','src/app/api/v1/reviews/route.ts','const userOrders','Stored orders are searched to associate product SKU with a real purchase; verified flag reflects evidence.'),
 query('Persist reviews','src/app/api/v1/reviews/route.ts','await repo.put("reviews", reviewRecord)','reviews holds userId, optional orderId, productSku, productSlug, rating, status and verified.'),
 front('Visible reviews and ratings','src/components/product-reviews.tsx',null,'Public review read path filters approved reviews.')
],{errorFile:'src/app/api/v1/reviews/route.ts',errorMarker:'export async function POST'});
flow('14-support','Customer support','Care tickets, conversations, attachments, mailbox and authenticated replies',[
 front('Open support conversation','src/components/account-support.tsx',null,'Customer care interface sends tickets, reads conversations and uploads attachments.'),
 api('Care / support API','src/app/api/v1/care/[[...path]]/route.ts','export async function POST','POST /api/v1/care/tickets','Authenticated care path creates structured tickets. /api/v1/support is a separate legacy ticket path.'),
 n('Authenticate and validate','Backend','Authentication','src/app/api/v1/care/[[...path]]/route.ts','async function viewer','Care viewer must be signed in; schema and rate limit apply to mutations.'),
 service('Create care ticket',CARE,'export async function createCareTicket','Record request and initial support conversation; order-linked requests validate ownership.'),
 query('Tickets and messages','src/server/support-conversations.ts','export async function appendConversationMessage','tickets, support_conversations, support_messages and attachment metadata store conversation state.'),
 service('Support inbox and replies','src/server/support-inbox.ts','saveReply','Owner/support inbox manages replies, status and mail thread linkage.'),
 external('Resend / Gmail mailbox','src/server/support-gmail.ts',null,'Gmail OAuth mailbox sync and Resend outbound delivery are implemented code paths.'),
 front('Updated conversation','src/components/account-support.tsx',null,'Customer sees support replies; realtime notifications have a separate transport service.')
],{notes:['Care tickets and legacy support_tickets are distinct collections. Conversation IDs encode the source collection; do not conflate them.']});
flow('15-notifications','Notifications & email automation','Idempotent outbox, protected cron delivery and recorded notifications',[
 n('Order / account event','Backend','Trigger',M,'export async function queueOrderConfirmation','Account verification, recovery, confirmed orders and shipping events trigger relevant mail routines.'),
 query('Queue outbox message',M,'await repo.put<Mail>("outbox"','Outbox IDs and existing-record checks prevent duplicate messages.'),
 api('Protected mail cron','src/app/api/cron/mail/route.ts','export function GET','GET /api/cron/mail','Bearer CRON_SECRET is required; no secret value is exported.'),
 n('Cron authorization','Backend','Authentication','src/app/api/cron/mail/route.ts','throw new ApiError(401','Missing or incorrect bearer token is rejected.'),
 service('Deliver pending outbox',M,'export async function deliverMail','Read pending messages, send and mark sent only after successful delivery.'),
 external('Resend Emails HTTP API',M,'https://api.resend.com/emails','Account and order mail HTTP integration; retries and failure status remain explicit.'),
 query('Mark sent / record logs','src/server/notification-service.ts','async function recordNotificationLog','Notification studio has notification_logs and deduplication; account events write account_notifications.'),
 front('Notification and activity UI','src/components/account-activity-feed.tsx',null,'Account activity reads notifications; admin notification studio reads delivery logs.')
],{notes:['Outbox delivery and notification studio dispatch are related but separate service paths; not every outbox send creates a notification_logs entry.']});
flow('16-marketing','Marketing & coupons','Persisted campaigns, click attribution, coupon pricing and paid usage',[
 front('Owner manages campaign / coupon','src/app/admin/(control-center)/marketing/page.tsx',null,'Marketing and coupon admin interfaces.'),
 api('Marketing / coupon API','src/app/api/admin/coupons/route.ts','export async function POST','POST /api/admin/coupons','Owner-authorized CRUD; campaign routes collect storefront activity.'),
 service('Persist coupon rules',AD,'export async function createAdminCoupon','Validate discount, eligibility, usage and expiration settings.'),
 query('coupons and campaigns','src/server/campaigns.ts','"campaignEvents"','Campaign events and order campaignId support attribution; coupons store pricing rules.'),
 gate('Coupon eligible at checkout?','src/server/checkout-pricing.ts','"coupons"','Server reads current coupon and prior customer orders to apply allowed pricing.'),
 service('Record paid coupon usage','src/server/checkout-pricing.ts','recordPaidCouponUsage','Confirmed order usage is recorded; pending checkout must not consume paid usage.'),
 front('Campaign and pricing results','src/app/admin/(control-center)/marketing/page.tsx',null,'Marketing UI and checkout display persisted campaign and discount outcomes.')
]);
flow('17-admin','Admin dashboard & operations','Owner session gate, catalog, fulfillment, support, settings and audit',[
 front('Open admin control center','src/components/admin/admin-shell.tsx',null,'Admin shell groups operations and navigation.'),
 n('Require owner role','Admin','Authentication',AA,'export async function requireOwner','Server components redirect missing sessions, unauthorized roles or database unavailability.'),
 api('Admin route handlers','src/app/api/admin/dashboard/route.ts','export async function GET','GET /api/admin/dashboard','Each API independently authorizes the owner session; no central middleware is invented.'),
 service('Run selected operation',AD,'export async function getDashboardOverview','Actual services cover products, inventory, orders, customers, payments, returns, support and settings.'),
 query('Stored business collections',D,'function mongoRepo','Repository queries and transactional mutations use native MongoDB driver.'),
 query('Audit critical changes',AA,'export async function recordAuditEvent','Critical owner operations record actor, action, resource, resourceId and details.'),
 front('Refresh admin view','src/components/admin/use-live-admin-refresh.ts',null,'Admin client refresh hooks request current data.')
]);
flow('18-reports','Reports & analytics','Stored sales reports, date ranges, campaign events and activity heartbeat',[
 front('Select report range','src/app/admin/(control-center)/reports/page.tsx',null,'Owner reports page selects report type and range.'),
 api('GET admin reports','src/app/api/admin/reports/route.ts','export async function GET','GET /api/admin/reports?type=…&range=…','authorizeAdminApi precedes getAdminReports.'),
 n('Authorize report viewer','Admin','Authentication',AA,'export async function authorizeAdminApi','Only authorized owner sessions can read admin reports.'),
 query('Stored orders and catalog',AD,'export async function getAdminReports','Orders plus full catalog feed buildStoredSalesReport; no synthetic revenue is claimed.'),
 service('Aggregate stored report',AD,'buildStoredSalesReport','Report calculations are imported from admin date-range helpers.'),
 front('Report / export results','src/app/admin/(control-center)/reports/page.tsx',null,'Reports UI presents calculated data; admin dashboard and campaign analytics are separate routes.')
],{notes:['AI copilot is an implemented optional DeepSeek request path. Model quality and production connectivity are Unverified; it does not replace stored sales calculations.']});
flow('19-security','Security & access control','Signed sessions, roles, origin checks, limits and explicit access errors',[
 n('Incoming protected request','API','Trigger',H,'export function originCheck','Applicable mutation handlers apply guards locally.'),
 n('JWT and stored session','Backend','Authentication',A,'export async function currentUser','Check HS256, issuer, audience, jti hash, session expiry and verified user record.'),
 gate('Required role / ownership?',AA,'export async function authorizeAdminApi','Owner admin APIs use normalized OWNER/ADMIN; legacy staff routes have different literal role checks.'),
 n('Origin and body limits','Backend','Validation',H,'export async function body','Origin allowlist and streamed body cap are helpers explicitly called by participating routes.'),
 query('Rate limit counters',H,'export async function limit','limits collection tracks scoped counts in a sixty-second window; exceeding threshold returns 429.'),
 service('Execute guarded handler',V,'export async function POST','Handlers parse Zod input and authorize the applicable resource before service mutations.'),
 n('Safe success / error response','API','Response',H,'export function api','api() maps Zod to 400, duplicate records to 409, ApiError to its code, unknown service errors to 503; redacts environment secrets.')
],{notes:['These protections are not universal middleware. API inventory lists checks found per handler; several routes use custom response/error wrappers. Broad origin allowances and inconsistent legacy role checks are documented review items, not silently corrected.']});
flow('20-master-commerce','Complete master e-commerce workflow','Customer journey from discovery to payment, delivery and aftercare',[
 front('Discover OVIA','src/app/page.tsx',null,'Home, navigation and bag / luggage storefront.'),
 front('Browse and choose variant','src/components/product-detail.tsx',null,'Product listing, detail, search and filter flows.'),
 service('Wishlist and shopping bag','src/components/store-provider.tsx',null,'Frontend provider sends cart and wishlist mutations.'),
 front('Review checkout','src/app/checkout/page.tsx',null,'Address, PIN serviceability, shipping method and quote.'),
 gate('Order valid and stock available?',C,'export async function createOrder','Idempotent order and stock reservation transaction.'),
 external('Verify provider payment',R,'export async function verifyRazorpayPayment','Razorpay secure checkout; PayPal sandbox is an alternate flow.'),
 service('Finalize paid order',C,'export async function finalizePayment','Confirmed paid state, replay event and mail queue.'),
 service('Owner fulfillment approval',L,'export function makeLogisticsService','Verified payment precedes courier shipment and pickup.'),
 external('Delhivery delivery tracking',SH,'export async function syncOrderTracking','Courier API / authenticated webhook updates stored shipping.'),
 front('Delivered order and aftercare','src/components/account-order-details.tsx',null,'Customer tracks delivery, submits reviews or opens cancellation / return / refund requests.'),
 service('Aftercare review and refund',CARE,'export async function createCareTicket','Tickets are reviewed; gateway refunds follow the separate authorized refund flow.'),
 front('Customer outcome recorded','src/components/account-orders-returns.tsx',null,'Display delivery, review request, cancellation and provider refund evidence.')
],{notes:['This master is a process composition of the individual evidence-mapped workflows, not one executable handler.']});
// Architecture views use explicit branches and shared response nodes.
flow('architecture-master','Master system architecture','Storefront, route handlers, MongoDB, integrations and owner operations',[
 front('Customer browser','src/app/layout.tsx',null,'Next.js storefront shell with customer-facing pages and client components.'),
 front('Storefront and account','src/components/store-provider.tsx',null,'Catalog, bag, checkout and account state coordinate client requests.'),
 api('Next.js API handlers',V,'export async function GET','/api/* and /api/v1/*','86 route files, including explicit dispatch branches and provider webhooks.'),
 service('Server business services',C,'export async function createOrder','Commerce, accounts, logistics, mail, support, marketing and reports.'),
 query('Native MongoDB repository',D,'function mongoRepo','MongoClient pool; repository access and withTransaction for coordinated writes.'),
 external('External service adapters','src/server/integrations-service.ts','export async function getAdminIntegrationsList','Razorpay, PayPal sandbox, Delhivery, Resend, Algolia, OAuth, Gmail, translation and DeepSeek.'),
 front('State and response rendered','src/components/store-provider.tsx',null,'Safe route responses update customer and owner views.')
],{group:'Architecture',notes:['MongoDB Atlas deployment topology is Unverified. The code proves a MongoDB connection and database selection, not specific cluster tiers or regions.']});
{
const w=workflows.at(-1),owner={...front('Owner control center','src/components/admin/admin-shell.tsx',null,'Server-protected owner operations and API-specific authorization.'),category:'Admin',id:'master-owner'};w.nodes.push(owner);w.edges.push({id:'master-owner-start',source:w.nodes[0].id,target:owner.id,label:'Owner session'},{id:'master-owner-api',source:owner.id,target:w.nodes[2].id,label:'/api/admin/*'});
}
flow('architecture-frontend','Frontend architecture','Pages, interactions, frontend components and their API boundaries',[
 front('Home and navigation','src/app/page.tsx',null,'Homepage and shared header / navigation.'),
 front('Bags / luggage catalog','src/app/[...segments]/page.tsx','path === "bags"','Catchall storefront resolves bags, luggage, categories and collection routes.'),
 front('Listings and product details','src/components/catalog-view.tsx',null,'Catalog facets and /products/[slug] detail.'),
 front('Cart and checkout','src/components/store-provider.tsx',null,'Store provider and cart page send server cart / checkout requests.'),
 api('Storefront API requests',V,'export async function GET','/api/products | /api/search | /api/v1/*','Actual client/server routes documented in the route inventory.'),
 service('Server processing',C,'export async function readCart','Services return current catalog, bag, quote and order data.'),
 front('Render confirmed result','src/components/store-provider.tsx',null,'State updates follow API results, with loading and error UI.')
],{group:'Architecture'});
{
const w=workflows.at(-1);const defs=[['Registration / OTP','src/components/auth-experience.tsx'],['Google / Apple sign-in','src/components/social-sign-in-buttons.tsx'],['Account dashboard','src/components/account-dashboard.tsx'],['Profile and addresses','src/components/customer-profile.tsx'],['Orders and tracking','src/components/account-orders-portal.tsx'],['Cancellation / returns','src/components/account-orders-returns.tsx'],['Refund / notifications','src/components/account-activity-feed.tsx'],['Product reviews','src/components/account-reviews.tsx'],['Customer support','src/components/account-support.tsx']];
for(const [i,[label,file]]of defs.entries()){const node={...front(label,file,null,'Customer account section backed by actual account, care, order or review APIs. Address book is a separate component.'),id:`frontend-account-${i}`};w.nodes.push(node);w.edges.push({id:`frontend-account-start-${i}`,source:w.nodes[0].id,target:node.id,label:'Account'},{id:`frontend-account-api-${i}`,source:node.id,target:w.nodes[4].id});}
}
flow('architecture-backend','Backend request lifecycle','Route-local guards, handlers, service calls, persistence and response',[
 n('HTTP request received','API','Trigger',V,'export async function POST','Next.js route receives request and promised path params.'),
 api('Resolve route handler',V,'const path =','/api/*','App Router file routes plus explicit catchall dispatch.'),
 n('Applicable auth / origin guards','Backend','Authentication',H,'export function originCheck','Each handler decides which helpers apply; this is a representative guarded mutation lifecycle.'),
 n('Validate body and input','Backend','Validation',H,'export async function body','Streaming body cap and Zod validation where explicitly called.'),
 service('Handler calls service',C,'export async function createOrder','Actual business rules and idempotency are in server modules.'),
 query('Repository / Mongo transaction',D,'export async function transaction','Native database operations share a session when required.'),
 external('Provider API when required',R,'async function providerRequest','External writes are reconciled with durable local state; not all requests call a provider.'),
 n('Return success JSON','API','Response',H,'export function api','Common wrapper returns {data}; other routes use documented custom response shapes.')
],{group:'Architecture',notes:['Source contains no central src/middleware.ts or src/proxy.ts. Guards are route-local and server-component-local. Logging is selective, not a universal centralized logging pipeline.']});
flow('architecture-api','API architecture','All discovered route groups with operation-level source mapping',[
 n('Client / webhook request','API','Trigger',V,'export async function GET','Customer, owner, cron and provider entry points.'),
 api('App Router dispatch',V,'const path =','/api/*','Inventory records every exported method from all 86 route files; catchalls have an additional explicit branch inventory.'),
 service('Handler-specific guards',H,'export function api','Auth, origin, rate limits, validation and response conventions vary by endpoint.'),
 query('Database / service boundary',D,'function mongoRepo','Imported service symbols and source file evidence are retained per operation.'),
 n('Actual route response','API','Response',H,'export function api','Use the inventory and per-operation graph to inspect the full source-derived lifecycle.')
],{group:'Architecture'});
{
const w=workflows.at(-1);w.edges=w.edges.filter(e=>e.source!==w.nodes[2].id||e.failure);
const groups=['Authentication','Account','Products','Categories','Search','Cart & checkout','Orders','Payments','Shipping','Returns & refunds','Reviews','Support','Admin','Notifications','Marketing','Reports','Other'];
for(const [i,g]of groups.entries()){const routes=inventory.routes.filter(r=>r.group===g),first=routes[0];if(!first)continue;const node={...n(`${g} APIs`,'API','HTTP Request',first.file,null,`${routes.length} exported file-route operations. See inventory for individual handlers, service symbols and detected guards.`),id:`api-group-${i}`};w.nodes.push(node);w.edges.push({id:`api-group-in-${i}`,source:w.nodes[2].id,target:node.id},{id:`api-group-out-${i}`,source:node.id,target:w.nodes[3].id});}
}
const relations=[
 ['sessions','users','userId -> users.id',A,'session.userId'],
 ['addresses','users','userId -> users.id','src/app/api/v1/account/addresses/[[...id]]/route.ts','userId'],
 ['orders','users','userId / owner -> user identity',C,'userId,'],
 ['checkoutSessions','orders','orderId -> orders.id',C,'orderId: order.id'],
 ['inventory','products','id -> variants[].sku',D,'bySku.get(v.sku)'],
 ['carts','products','lines[].sku -> variants[].sku',C,'v.sku === line.sku'],
 ['reviews','users','userId -> users.id','src/app/api/v1/reviews/route.ts','userId: user.id'],
 ['reviews','orders','optional orderId -> orders.id','src/lib/types.ts','orderId?: string'],
 ['tickets','orders','orderId -> orders.id',CARE,'input.orderId'],
 ['returns','tickets','ticketId -> tickets.id',AD,'ticketId: ticket.id'],
 ['returns','orders','orderRawId -> orders.id',AD,'orderRawId: order.id'],
 ['orders','campaigns','campaignId -> campaigns.id',C,'repo.get("campaigns",campaignId)'],
 ['campaignEvents','campaigns','campaignId -> campaign identity','src/server/campaigns.ts','campaignId'],
 ['support_messages','support_conversations','ticketId -> conversation ID','src/server/support-conversations.ts','ticketId'],
 ['account_notifications','users','userId -> users.id','src/server/account-activity.ts','userId'],
 ['inventoryMovements','inventory','sku -> inventory.id',AD,'sku:params.sku'],
];
const relationshipRecords=relations.map(([source,target,label,file,marker])=>({source,target,label,evidence:evidence(file,marker),kind:'Application reference; no MongoDB foreign-key constraint is declared'}));
flow('architecture-database','Database collections & relationships','Native driver, code-backed collections and explicit reference fields',[
 n('Database service request','Backend','Trigger',D,'export async function mongo','Backend requests a shared MongoDB client.'),
 query('MongoClient connection pool',D,'maxPoolSize: 10','MONGODB_URI environment lookup, pool of 10 and six-second selection timeout. No URI is displayed.'),
 gate('Database configured?',D,'MongoDB is not configured','Live services fail without MongoDB. A legacy local adapter exists after an unconditional early rejection and is not a working fallback.'),
 query('ovia database / override',D,'process.env.MONGODB_DB','Configured DB name or ovia default; deployed Atlas topology is Unverified.'),
 query('Collections and indexes',D,'export async function setupDatabase','setupDatabase defines identity, email uniqueness, token TTL and checkout idempotency indexes.'),
 n('Persisted result','Backend','Response',D,'export async function readRepository','Repository reads and transactional writes return stored records.')
],{group:'Architecture',notes:['48 literal collection names were found in queries or index definitions. A collection name in code does not prove that the collection exists in production.','Payments, refunds and shipments are embedded in orders. Wishlist is embedded in users. Categories are matched by catalog fields; no category foreign key is declared.','No Mongoose schemas were found; data models are TypeScript types plus runtime route validation.']});
{
const w=workflows.at(-1);for(const [i,c]of inventory.collections.entries()){const node={...n(c.name,'Database','Database Query',c.evidence[0].file,null,`Actual collection name used by source. Evidence: ${c.evidence.length} literal references. Production contents are Unverified.`),evidence:c.evidence.map(e=>({file:e.file,line:e.line,symbol:e.method})),id:`db-${c.name}`};w.nodes.push(node);w.edges.push({id:`db-collection-${i}`,source:w.nodes[4].id,target:node.id,label:'Collection access'},{id:`db-result-${i}`,source:node.id,target:w.nodes[5].id});}for(const [i,r]of relationshipRecords.entries())w.edges.push({id:`db-rel-${i}`,source:`db-${r.source}`,target:`db-${r.target}`,label:r.label});
}
const integrations=[
 ['MongoDB / Atlas','Native driver and transactional repository',D,'export async function mongo','Implemented','Hosting on Atlas, cluster layout and live connectivity are Unverified.'],
 ['Razorpay','Orders, captured payments, signed webhooks and refunds',R,'export async function beginRazorpayCheckout','Implemented','Credentials, enabled webhook events and merchant connectivity are Unverified.'],
 ['PayPal','Sandbox orders, approval, capture and verified webhook','src/server/paypal.ts','const base','Implemented','Sandbox endpoint is explicit. Live PayPal settlement and automatic PayPal refunds are Planned.'],
 ['Delhivery','Serviceability, shipment, pickup, cancellation and tracking','src/lib/shipping/delhivery.ts',null,'Implemented','Courier configuration and live operational readiness are Unverified.'],
 ['Resend','Outbound account, order, support and notification email',M,'https://api.resend.com/emails','Implemented','Sender domain, API configuration and delivered email are Unverified.'],
 ['Google OAuth','State / PKCE and JWKS-verified identity','src/server/social-auth.ts','https://oauth2.googleapis.com/token','Implemented','Enabled provider configuration is Unverified.'],
 ['Apple OAuth','Identity verification and client-secret signing','src/server/social-auth.ts','export async function appleClientSecret','Implemented','Apple keys, enabled provider and runtime readiness are Unverified.'],
 ['Algolia','Search SDK and optional product index synchronization','src/lib/algolia.ts','export async function searchAlgoliaProducts','Implemented','Index freshness and configured keys are Unverified.'],
 ['Stripe','Legacy test-mode checkout and signed webhook',V,'stripe.checkout.sessions.create','Implemented','Checkout is guarded to sk_test_ credentials; live checkout is not claimed.'],
 ['Gmail','OAuth mailbox connection and sync','src/server/support-gmail.ts',null,'Implemented','Mailbox connection, grants and scheduler execution are Unverified.'],
 ['DeepL / Google Translate','HTTP translation provider selection','src/app/api/translate/route.ts','export async function POST','Implemented','Provider selection depends on environment; active configuration is Unverified.'],
 ['DeepSeek AI','Owner copilot with constrained provider endpoint','src/server/ai-copilot.ts','export async function askCopilot','Implemented','Provider connectivity and model response quality are Unverified.'],
 ['Support Socket.IO','Separate realtime support transport','src/components/use-support-realtime.ts',null,'Implemented','Local support process / deployment transport availability is Unverified.'],
 ['Delhivery Maps MCP','JSON-RPC tools/call for address, search and route tools','src/lib/shipping/delhivery-maps.ts','async function callDelhiveryMapsTool','Implemented','Active token and tool availability are Unverified. A hardcoded fallback token exists in source; its value is excluded from documentation.'],
 ['Cloudinary media URLs','Validated public-ID image transformation URL helper','src/lib/media.ts','export function cloudinaryImage','Implemented','The helper creates CDN URLs. Admin uploads currently write to local public/media/uploads; Cloudinary upload API implementation is not claimed.'],
 ['Frankfurter exchange rates','INR display-rate HTTP fetch with cache','src/app/api/v1/rates/route.ts','export async function GET','Implemented','Rates are approximate display conversions; provider failure returns an empty rate list. Runtime availability is Unverified.'],
 ['OpenStreetMap tiles','Leaflet browser tile requests for store maps','src/components/store-map.tsx','https://tile.openstreetmap.org','Implemented','Public tile rendering is implemented; availability and usage at runtime are Unverified.'],
 ['WhatsApp contact links','Browser deep links to WhatsApp / wa.me','src/components/whatsapp-widget.tsx','whatsappMobileUrl','Implemented','This contact UI opens WhatsApp. It does not prove a server-side automated message-sending API exists.'],
 ['Meta Business health checks','Stored settings and Graph API identity checks','src/server/integrations-service.ts','case "whatsapp"','Unverified','Credential-check code exists for WhatsApp/Messenger. Automated message delivery and a verified Messenger webhook are not established by these checks.'],
 ['Google Analytics settings','Measurement-ID storage and format check','src/server/integrations-service.ts','case "google_analytics"','Unverified','Settings UI exists. No gtag/GA collection call was found in src; automatic GA4 event delivery is Planned, not proven by ID validation.'],
];
const integrationRecords=integrations.map(([name,communication,file,marker,status,notes])=>({name,communication,status,runtimeStatus:'Unverified',notes,evidence:[evidence(file,marker)]}));
flow('architecture-integrations','External integrations','Actual provider adapters, communication paths and runtime uncertainty',[
 n('Backend integration request','Backend','Trigger','src/server/integrations-service.ts','export async function getAdminIntegrationsList','Service code selects a provider for the requested task.'),
 service('Provider configuration boundary','src/server/integrations-service.ts','export async function getStoredIntegrationSettings','Read environment and stored integration settings; no credential values appear in the editor.'),
 n('Provider result / error','Backend','Response',H,'export function api','Caller receives provider-confirmed data or a route-specific service error.')
],{group:'Architecture',notes:['All listed adapters have code evidence. Runtime configuration is Unverified because this task does not read production secrets or call live providers. No integration is labeled Configured without configuration evidence.']});
{
const w=workflows.at(-1);w.edges=w.edges.filter(e=>!(e.source===w.nodes[1].id&&!e.failure));for(const [i,p]of integrationRecords.entries()){const node={...n(p.name,'External','External API',null,null,`${p.communication}. ${p.notes}`,p.status),evidence:p.evidence,id:`integration-${i}`};w.nodes.push(node);w.edges.push({id:`integration-in-${i}`,source:w.nodes[1].id,target:node.id},{id:`integration-out-${i}`,source:node.id,target:w.nodes[2].id,label:'Provider response'},{id:`integration-error-${i}`,source:node.id,target:'architecture-integrations-error',failure:true,label:'Provider unavailable'});}
}
// Separate database-domain views, preserving embedded structures and source references.
const domains=[['users','User & account data',['users','sessions','addresses','tokens','account_notifications']],['catalog','Catalog & stock data',['products','categories','inventory','inventoryMovements']],['cart','Cart & checkout data',['carts','checkoutSessions','checkoutPromos','coupons']],['orders','Orders, payments & shipments',['orders','events','order_return_requests']],['returns','Returns & refund review data',['tickets','returns','orders']],['reviews','Reviews & ratings data',['reviews','users','orders']],['support','Support & conversation data',inventory.collections.filter(c=>c.name.startsWith('support_')).map(c=>c.name)],['notifications','Notification & mail data',['outbox','account_notifications','notification_logs']],['admin','Admin settings & audit data',['audit','settings','integrations','site_content']],['marketing','Marketing & editorial data',['campaigns','campaignEvents','newsletter_subscribers','stories','bulk_orders']]];
for(const [slug,title,names]of domains){const steps=[n('Domain persistence request','Backend','Trigger',D,'function mongoRepo','Application services query the collections listed in this domain.'),...names.filter(name=>inventory.collections.some(c=>c.name===name)).map(name=>{const c=inventory.collections.find(c=>c.name===name);return{...query(name,c.evidence[0].file,null,`Code-backed collection ${name}; view reference fields in the model inventory.`),evidence:c.evidence.map(e=>({file:e.file,line:e.line,symbol:e.method}))};}),n('Stored domain response','Backend','Response',D,'export async function readRepository','Return persisted domain data to the service.')];const w=flow(`database-${slug}`,title,'Collection boundaries and source-backed data references',steps,{group:'Architecture'});w.notes.push(...relationshipRecords.filter(r=>names.includes(r.source)||names.includes(r.target)).map(r=>`${r.source}.${r.label} (${r.evidence.file}:${r.evidence.line})`));if(slug==='orders')w.notes.push('PaymentInfo, providerId, captureId, refunds[], shipping and logisticsOperations are embedded on Order. No separate payment or shipment collection is asserted.');}
flow('database-atlas-boundary','MongoDB connection & Atlas boundary','Verified connection code; hosted cluster topology explicitly unverified',[
 n('Database operation requested','Backend','Trigger',D,'export async function mongo','Server code requests a shared MongoDB connection.'),
 gate('MONGODB_URI supplied?',D,'MongoDB is not configured','Absence rejects live operations; no credentials are displayed.'),
 query('Shared native-driver pool',D,'maxPoolSize: 10','MongoClient.connect, maxPoolSize 10 and serverSelectionTimeoutMS 6000 are actual code settings.'),
 n('Hosted cluster / Atlas boundary','External','External API',D,'new MongoClient','MongoDB hosting, Atlas cluster tier, region, replica placement and network access rules cannot be inferred from the connection code.','Unverified'),
 query('Database selection and transaction',D,'export async function transaction','MONGODB_DB override or ovia default; writes can share ClientSession.withTransaction.'),
 n('Repository result returned','Backend','Response',D,'function mongoRepo','Stored records or a surfaced database error return to business services.')
],{group:'Architecture',notes:['The hosted-cluster node is a trust boundary, not proof of an Atlas deployment. No private network, replica topology or production configuration has been invented.']});
{
 const names=[...new Set(relationshipRecords.flatMap(r=>[r.source,r.target]))];
 const steps=[n('Read application entities','Backend','Trigger',D,'function mongoRepo','Entity and reference view derived from actual collection access and reference fields.'),...names.map(name=>{const c=inventory.collections.find(c=>c.name===name);return{...query(name,c.evidence[0].file,null,`Application entity stored in ${name}. Relationship edges identify actual reference fields and imply no MongoDB foreign-key constraint.`),evidence:c.evidence.slice(0,4).map(e=>({file:e.file,line:e.line,symbol:e.method}))};}),n('Return entity data','Backend','Response',D,'export async function readRepository','Read results return to the application.')];
 const w=flow('database-entities','Entity relationships','Actual user, catalog, checkout, support and order reference fields',steps,{group:'Architecture'});
 const start=w.nodes[0].id,end=w.nodes[names.length+1].id,ids=new Map(names.map((name,i)=>[name,w.nodes[i+1].id]));
 w.edges=w.edges.filter(e=>e.failure);w.edges.push(...names.flatMap((name,i)=>[{id:`entity-entry-${i}`,source:start,target:ids.get(name),label:'Repository access'},{id:`entity-result-${i}`,source:ids.get(name),target:end,label:'Read result'}]));
 w.edges.push(...relationshipRecords.map((r,i)=>({id:`entity-ref-${i}`,source:ids.get(r.source),target:ids.get(r.target),label:r.label})));
 w.notes.push('Reference edges represent application-level lookup relationships. Repository access/result edges preserve diagram entry and exit, not additional entity relationships.','orders embeds paymentInfo, refunds[], shipping and logisticsOperations; users embeds accountWishlist. No nonexistent separate entity is introduced.');
}
const meta={repository:inventory.repository,commit:inventory.commit,scope:inventory.scope,sourceFiles:inventory.files.length,routeFiles:new Set(inventory.routes.map(r=>r.file)).size,operations:inventory.routes.length,collections:inventory.collections.length,businessWorkflows:20,architectureDiagrams:workflows.filter(w=>w.group==='Architecture').length,generatedAt:new Date().toISOString(),runtimeStatus:'Unverified',graphSemantics:'Documentation graphs, not executable n8n workflows. Edges are process/data-flow compositions supported by references; planned edges are proposals.'};
fs.writeFileSync('data/workflows.json',JSON.stringify({meta,workflows,integrations:integrationRecords,relationships:relationshipRecords},null,2));
console.log(`Generated ${workflows.length} diagrams with ${workflows.reduce((s,w)=>s+w.nodes.length,0)} mapped/proposed nodes.`);
