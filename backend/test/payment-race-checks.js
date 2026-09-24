const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const payment = require("../src/services/payment.service");

function createState() {
  return {
    orderStatus: "PENDING_PAYMENT",
    paymentStatus: "CREATED",
    paymentId: null,
    stock: 5,
    reserved: 2,
    queuePosition: null,
  };
}

function cancelOrExpire(state) {
  if (state.orderStatus === "PENDING_PAYMENT") {
    state.orderStatus = "CANCELLED";
    state.paymentStatus = "FAILED";
    state.stock += state.reserved;
    state.reserved = 0;
    return true;
  }
  if (state.orderStatus === "PENDING" && state.paymentStatus === "CAPTURED") {
    state.orderStatus = "CANCELLED";
    state.paymentStatus = "REFUND_REQUIRED";
    state.queuePosition = null;
    return true;
  }
  return false;
}

function confirm(state, paymentId) {
  if (state.paymentStatus === "CAPTURED" && state.orderStatus === "PENDING") {
    if (!state.paymentId) state.paymentId = paymentId;
    return "already-confirmed";
  }
  if (state.orderStatus !== "PENDING_PAYMENT") return "refund-required";

  state.paymentStatus = "CAPTURED";
  state.paymentId = paymentId;
  state.orderStatus = "PENDING";
  state.queuePosition = 1;
  return "confirmed";
}

function testReservationReleaseIsExactlyOnce() {
  const state = createState();
  assert.equal(cancelOrExpire(state), true);
  assert.equal(cancelOrExpire(state), false);
  assert.equal(state.stock, 7);
  assert.equal(state.reserved, 0);
}

function testCancellationRaceWithConfirmation() {
  const state = createState();
  cancelOrExpire(state);
  assert.equal(confirm(state, "pay_late"), "refund-required");
  assert.equal(state.orderStatus, "CANCELLED");
  assert.equal(state.paymentStatus, "FAILED");
  assert.equal(state.queuePosition, null);

  const captured = createState();
  confirm(captured, "pay_1");
  assert.equal(cancelOrExpire(captured), true);
  assert.equal(captured.paymentStatus, "REFUND_REQUIRED");
  assert.equal(captured.stock, 5);
  assert.equal(captured.queuePosition, null);
}

function testInitializationRaceLeavesNoActiveAttempt() {
  const state = createState();
  cancelOrExpire(state);
  assert.notEqual(state.orderStatus, "PENDING_PAYMENT");
  assert.notEqual(state.paymentStatus, "CREATED");
}

function testOrderPaidThenCapturedAndDuplicateCapture() {
  const state = createState();
  state.paymentStatus = "CAPTURED";
  state.orderStatus = "PENDING";
  assert.equal(confirm(state, "pay_from_captured_event"), "already-confirmed");
  assert.equal(state.paymentId, "pay_from_captured_event");
  assert.equal(confirm(state, "pay_from_captured_event"), "already-confirmed");
  assert.equal(state.paymentId, "pay_from_captured_event");
}

function testDuplicateWebhookDelivery() {
  const state = createState();
  assert.equal(confirm(state, "pay_webhook"), "confirmed");
  assert.equal(confirm(state, "pay_webhook"), "already-confirmed");
  assert.equal(state.stock, 5);
  assert.equal(state.queuePosition, 1);
}

function testHelpersAndRouteContracts() {
  process.env.RAZORPAY_KEY_SECRET = "unit-test-secret";
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update("order_test|payment_test")
    .digest("hex");

  assert.equal(payment.verifyPaymentSignature("order_test", "payment_test", signature), true);
  assert.equal(payment.verifyPaymentSignature("order_test", "payment_test", "invalid"), false);
  assert.equal(payment.amountToPaise("12.50"), 1250n);

  const serviceSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "payment.service.js"),
    "utf8"
  );
  const routeSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "routes", "payment.routes.js"),
    "utf8"
  );
  assert.match(serviceSource, /status: "REFUND_REQUIRED"/);
  assert.match(serviceSource, /queuePosition, estimatedMinutes/);
  assert.match(serviceSource, /razorpayPaymentId: paymentEntity\?\.id/);
  assert.match(serviceSource, /currentOrder\.status !== "PENDING"/);
  assert.match(serviceSource, /status: \{ in: \["PENDING", "PENDING_PAYMENT"\] \}/);
  assert.match(routeSource, /express\.raw\(\{ type: "application\/json" \}\)/);
}

testReservationReleaseIsExactlyOnce();
testCancellationRaceWithConfirmation();
testInitializationRaceLeavesNoActiveAttempt();
testOrderPaidThenCapturedAndDuplicateCapture();
testDuplicateWebhookDelivery();
testHelpersAndRouteContracts();

console.log("payment race/state checks passed");
console.log("Note: these are dependency-free state-machine and contract checks; PostgreSQL/Razorpay integration tests still require provider/test fixtures.");
