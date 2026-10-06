/**
 * ============================================================================
 * FOODOSO - Smart Food Delivery & Bill Splitter Engine
 * Client Script (script.js)
 * ============================================================================
 */

(function (global) {
  'use strict';

  const Foodoso = {
    version: '4.0.0',

    /**
     * Format a numerical amount into currency string
     * @param {number} amount
     * @param {string} symbol
     * @returns {string} e.g. "₹450.00"
     */
    formatCurrency(amount, symbol = '₹') {
      const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
      return `${symbol}${val.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    },

    /**
     * Calculate equal contribution per person given a total bill and friend count
     * @param {number} totalBill
     * @param {number} friendCount
     * @returns {{ totalBill: number, friendCount: number, perPerson: number }}
     */
    calculateEqualSplit(totalBill, friendCount) {
      const bill = Math.max(0, parseFloat(totalBill) || 0);
      const count = Math.max(1, parseInt(friendCount, 10) || 1);
      const perPerson = Math.round((bill / count) * 100) / 100;
      return {
        totalBill: bill,
        friendCount: count,
        perPerson: perPerson,
      };
    },

    /**
     * Complete Itemized Dining Split Calculation Engine
     * Pro-rates taxes, service charges, discounts, and tips mathematically.
     *
     * @param {Array<{ id: string, name: string, price: number, quantity?: number, assignedTo?: string[] }>} items
     * @param {Array<{ id: string, name: string }>} friends
     * @param {number} taxPercent e.g. 5 for 5% GST
     * @param {number} serviceChargePercent e.g. 5
     * @param {number} tipFixed fixed amount in currency
     * @param {Object|null} offer optional discount offer
     * @param {Record<string, number>} paidAmounts map of friendId -> amount already paid
     * @returns {Object} Full breakdown of totals and per-friend shares
     */
    calculateSplits(
      items = [],
      friends = [],
      taxPercent = 5,
      serviceChargePercent = 5,
      tipFixed = 0,
      offer = null,
      paidAmounts = {}
    ) {
      if (!friends || friends.length === 0) {
        return {
          isValid: false,
          errorMessage: 'No friends in dinner squad.',
          subtotal: 0,
          grandTotal: 0,
          equalPerPerson: 0,
          shares: [],
        };
      }

      // 1. Calculate raw dish consumption per friend
      const friendRawTotals = {};
      friends.forEach((f) => {
        friendRawTotals[f.id] = 0;
      });

      let subtotal = 0;

      items.forEach((item) => {
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        subtotal += itemTotal;

        const assigned = item.assignedTo && item.assignedTo.length > 0
          ? item.assignedTo
          : friends.map((f) => f.id); // Default to whole table

        const validAssigned = assigned.filter((id) => friendRawTotals[id] !== undefined);
        const splitCount = validAssigned.length > 0 ? validAssigned.length : friends.length;
        const portion = itemTotal / splitCount;

        if (validAssigned.length > 0) {
          validAssigned.forEach((fid) => {
            friendRawTotals[fid] += portion;
          });
        } else {
          friends.forEach((f) => {
            friendRawTotals[f.id] += portion;
          });
        }
      });

      // 2. Customer Offer Discount
      let discountAmount = 0;
      if (offer && subtotal >= (offer.minOrder || 0)) {
        if (offer.discountType === 'percent') {
          discountAmount = (subtotal * offer.discountValue) / 100;
          if (offer.maxDiscount) {
            discountAmount = Math.min(discountAmount, offer.maxDiscount);
          }
        } else {
          discountAmount = offer.discountValue || 0;
        }
      }

      const discountedSubtotal = Math.max(0, subtotal - discountAmount);

      // 3. Proportional Taxes & Service Charge
      const taxAmount = (discountedSubtotal * (taxPercent || 0)) / 100;
      const serviceChargeAmount = (discountedSubtotal * (serviceChargePercent || 0)) / 100;
      const tipAmount = Math.max(0, tipFixed || 0);

      const grandTotal = discountedSubtotal + taxAmount + serviceChargeAmount + tipAmount;
      const equalPerPerson = grandTotal / friends.length;

      // 4. Calculate individual shares
      const shares = friends.map((friend) => {
        const rawShare = friendRawTotals[friend.id] || 0;
        const proportion = subtotal > 0 ? rawShare / subtotal : 1 / friends.length;

        const friendDiscount = discountAmount * proportion;
        const friendDiscounted = Math.max(0, rawShare - friendDiscount);
        const friendTax = (friendDiscounted * (taxPercent || 0)) / 100;
        const friendService = (friendDiscounted * (serviceChargePercent || 0)) / 100;
        const friendTip = tipAmount * proportion;

        const finalShare = friendDiscounted + friendTax + friendService + friendTip;
        const paid = paidAmounts[friend.id] || 0;
        const pendingAmount = Math.max(0, finalShare - paid);

        return {
          friendId: friend.id,
          friendName: friend.name,
          rawShare,
          discountAmount: friendDiscount,
          taxAmount: friendTax,
          serviceChargeAmount: friendService,
          tipAmount: friendTip,
          finalShare,
          paidAmount: paid,
          pendingAmount,
          isSettled: pendingAmount <= 0.5 && finalShare > 0,
        };
      });

      return {
        isValid: true,
        subtotal,
        discountAmount,
        discountedSubtotal,
        taxAmount,
        serviceChargeAmount,
        tipAmount,
        grandTotal,
        equalPerPerson,
        shares,
      };
    },

    /**
     * Generate UPI Instant Payment Deep Link
     * @param {string} upiId recipient UPI ID e.g. "rohan@okhdfcbank"
     * @param {string} payeeName recipient display name
     * @param {number} amount amount to pay
     * @param {string} note payment memo
     * @returns {string} upi:// URI string
     */
    generateUPILink(upiId, payeeName, amount, note = 'FOODOSO Dining Split') {
      const sanitizedAmt = Math.max(0, parseFloat(amount) || 0).toFixed(2);
      const params = new URLSearchParams({
        pa: upiId,
        pn: payeeName,
        am: sanitizedAmt,
        cu: 'INR',
        tn: note,
      });
      return `upi://pay?${params.toString()}`;
    },

    /**
     * Calculate Pay Later Dining EMI
     * @param {number} principal
     * @param {number} tenureMonths
     * @param {number} annualInterestPercent e.g. 12 for 12% p.a.
     */
    calculateEMI(principal, tenureMonths = 3, annualInterestPercent = 12) {
      const p = Math.max(0, principal);
      const monthlyRate = annualInterestPercent / 12 / 100;
      const n = Math.max(1, tenureMonths);

      let emi = 0;
      if (monthlyRate === 0) {
        emi = p / n;
      } else {
        emi = (p * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
      }

      const totalRepayment = emi * n;
      const totalInterest = totalRepayment - p;

      return {
        principal: p,
        monthlyEMI: Math.round(emi * 100) / 100,
        totalRepayment: Math.round(totalRepayment * 100) / 100,
        totalInterest: Math.round(totalInterest * 100) / 100,
      };
    },

    /**
     * Storage Helpers
     */
    saveSession(key, data) {
      try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
      } catch (err) {
        console.error('FOODOSO storage save error:', err);
        return false;
      }
    },

    loadSession(key, defaultVal = null) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultVal;
      } catch (err) {
        console.error('FOODOSO storage read error:', err);
        return defaultVal;
      }
    },
  };

  // Expose to window / global environment
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Foodoso;
  } else {
    global.Foodoso = Foodoso;
    global.HisabKitab = Foodoso; // backwards compat
  }
})(typeof window !== 'undefined' ? window : this);
