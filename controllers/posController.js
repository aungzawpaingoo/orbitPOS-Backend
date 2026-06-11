// const pool = require('../config/db'); 

// const posController = {
//   createTransaction: async (req, res) => {
//     let connection;
//     try {
//       const { cart, totalAmount } = req.body;
//       const { id: userId, branchId, organizationId, role } = req.user;

//       if (role === 'owner') {
//         return res.status(403).json({ status: 'error', message: 'Unauthorized. Owners cannot execute sale transactions.' });
//       }

//       if (!cart || Object.keys(cart).length === 0) {
//         return res.status(400).json({ status: 'error', message: 'Cart items are missing.' });
//       }

//       const productIds = Object.keys(cart).map(id => Number(id));

//       connection = await pool.getConnection();
//       await connection.beginTransaction();

//       const [products] = await connection.query(
//         `SELECT p.id, p.name, p.price, bi.stock 
//          FROM products p
//          JOIN branch_inventory bi ON p.id = bi.product_id
//          WHERE p.id IN (?) AND bi.branch_id = ? AND bi.organization_id = ?`,
//         [productIds, branchId, organizationId]
//       );

//       if (products.length === 0) {
//         await connection.rollback();
//         return res.status(404).json({ status: 'error', message: 'Selected products not found in inventory.' });
//       }

//       for (const product of products) {
//         const requestedQty = cart[product.id.toString()] || cart[product.id];
//         if (product.stock < requestedQty) {
//           await connection.rollback();
//           return res.status(400).json({
//             status: 'error',
//             message: `${product.name} သည် လက်ကျန်မလုံလောက်ပါ။ (လက်ကျန်: ${product.stock})`
//           });
//         }
//       }

//       const [orderResult] = await connection.query(
//         "INSERT INTO orders (user_id, branch_id, total_amount, amount_paid, status, created_at) VALUES (?, ?, ?, 0.00, 'pending', NOW())",
//         [userId, branchId, totalAmount]
//       );
//       const newOrderId = orderResult.insertId;

//       for (const product of products) {
//         const requestedQty = cart[product.id.toString()] || cart[product.id];
//         await connection.query(
//           'INSERT INTO order_items (order_id, product_id, quantity, price_at_sale) VALUES (?, ?, ?, ?)',
//           [newOrderId, product.id, requestedQty, product.price]
//         );
//       }

//       await connection.commit();
//       return res.status(201).json({
//         status: 'success',
//         message: 'Pending statement setup successful.',
//         orderId: newOrderId,
//         totalAmount: totalAmount
//       });

//     } catch (error) {
//       if (connection) await connection.rollback();
//       return res.status(500).json({ status: 'error', message: error.message });
//     } finally {
//       if (connection) connection.release();
//     }
//   },

//   confirmPayment: async (req, res) => {
//     let connection;
//     try {
//       const { id } = req.params;
//       const { paymentMethod, billingMode, amountPaid } = req.body;
//       const { branchId, organizationId } = req.user;

//       connection = await pool.getConnection();
//       await connection.beginTransaction();

//       const [orderRows] = await connection.query(
//         `SELECT id, total_amount, status FROM orders 
//          WHERE id = ? AND branch_id = ? AND branch_id IN (
//            SELECT DISTINCT branch_id FROM branch_inventory WHERE organization_id = ?
//          )`,
//         [id, branchId, organizationId]
//       );

//       if (orderRows.length === 0) {
//         await connection.rollback();
//         return res.status(404).json({ status: 'error', message: 'Order reference log target file not found.' });
//       }

//       const order = orderRows[0];
//       if (order.status === 'completed' || order.status === 'partially_paid') {
//         await connection.rollback();
//         return res.status(400).json({ status: 'error', message: 'This order transaction has already been cleared.' });
//       }

//       const verifiedAmountPaid = parseFloat(amountPaid) || 0;
//       const targetTotal = parseFloat(order.total_amount);

//       if (billingMode === 'full' && verifiedAmountPaid < targetTotal) {
//         await connection.rollback();
//         return res.status(400).json({ status: 'error', message: 'စရန်ငွေမဟုတ်ပါက ကျသင့်ငွေအပြည့်အဝ ပေးချေရန် လိုအပ်ပါသည်။' });
//       }

//       const [items] = await connection.query(
//         `SELECT oi.product_id, oi.quantity, p.name, bi.stock 
//          FROM order_items oi
//          JOIN products p ON oi.product_id = p.id
//          JOIN branch_inventory bi ON p.id = bi.product_id
//          WHERE oi.order_id = ? AND bi.branch_id = ? FOR UPDATE`,
//         [id, branchId]
//       );

//       for (const item of items) {
//         if (item.stock < item.quantity) {
//           await connection.rollback();
//           return res.status(400).json({
//             status: 'error',
//             message: `ငွေမချေနိုင်ပါ။ ${item.name} သည် လက်ကျန်မလုံလောက်တော့ပါ။ (လက်ကျန်: ${item.stock})`
//           });
//         }
//       }

//       for (const item of items) {
//         await connection.query(
//           'UPDATE branch_inventory SET stock = stock - ? WHERE product_id = ? AND branch_id = ?',
//           [item.quantity, item.product_id, branchId]
//         );
//       }

//       const finalizedStatus = billingMode === 'split' ? 'partially_paid' : 'completed';

//       await connection.query(
//         "UPDATE orders SET status = ?, payment_type = ?, amount_paid = ? WHERE id = ?",
//         [finalizedStatus, paymentMethod, verifiedAmountPaid, id]
//       );

//       await connection.commit();
//       return res.status(200).json({
//         status: 'success',
//         message: finalizedStatus === 'partially_paid' ? 'စရန်ငွေ လက်ခံရရှိပြီးပါပြီ।' : 'ငွေပေးချေမှု လုပ်ငန်းစဉ် ပြီးမြောက်သွားပါပြီ।'
//       });

//     } catch (error) {
//       if (connection) await connection.rollback();
//       return res.status(500).json({ status: 'error', message: error.message });
//     } finally {
//       if (connection) connection.release();
//     }
//   },

//   getReceiptsByDate: async (req, res) => {
//     try {
//       const { date } = req.query;
//       const { branchId } = req.user;

//       if (!date) {
//         return res.status(400).json({ status: 'error', message: 'Date parameter is required.' });
//       }

//       const [rows] = await pool.query(
//         `SELECT id, 
//                 CAST(total_amount AS SIGNED) AS total, 
//                 IF(status = 'partially_paid', 'split', 'full') AS mode, 
//                 CAST(amount_paid AS SIGNED) AS paid, 
//                 payment_type AS method, 
//                 DATE_FORMAT(created_at, '%H:%i') AS time
//          FROM orders 
//          WHERE branch_id = ? 
//            AND DATE(created_at) = ? 
//            AND status IN ('completed', 'partially_paid')
//          ORDER BY created_at DESC`,
//         [branchId, date]
//       );

//       return res.status(200).json({
//         status: 'success',
//         data: rows
//       });
//     } catch (error) {
//       return res.status(500).json({ status: 'error', message: error.message });
//     }
//   },

//   printReceipt: async (req, res) => {
//     try {
//       const { id } = req.params;
//       return res.status(200).json({
//         status: 'success',
//         message: 'Receipt format configuration processed successfully.'
//       });
//     } catch (error) {
//       return res.status(500).json({ status: 'error', message: error.message });
//     }
//   },

//   getTransactionDetail: async (req, res) => {
//     try {
//       const { id } = req.params;
//       const { organizationId, branchId, role } = req.user;
      
//       let orderQuery = `
//         SELECT o.* FROM orders o
//         WHERE o.id = ? AND o.branch_id IN (
//           SELECT DISTINCT branch_id FROM branch_inventory WHERE organization_id = ?
//         )
//       `;
//       let queryParams = [id, organizationId];

//       if (role === 'employee') {
//         orderQuery += ' AND o.branch_id = ?';
//         queryParams.push(branchId);
//       }

//       const [orderRows] = await pool.query(orderQuery, queryParams);
//       if (orderRows.length === 0) {
//         return res.status(404).json({ status: 'error', message: 'Transaction record log not found or unauthorized.' });
//       }

//       const [itemRows] = await pool.query(
//         `SELECT oi.id, oi.product_id, p.name, oi.quantity, oi.price_at_sale 
//          FROM order_items oi
//          JOIN products p ON oi.product_id = p.id
//          WHERE oi.order_id = ?`,
//          [id]
//       );

//       return res.status(200).json({
//         status: 'success',
//         order: orderRows[0],
//         items: itemRows
//       });
//     } catch (error) {
//       return res.status(500).json({ status: 'error', message: error.message });
//     }
//   },

//   deleteTransaction: async (req, res) => {
//     let connection;
//     try {
//       const { id } = req.params;
//       const { branchId, organizationId, role } = req.user;

//       if (role === 'owner') {
//         return res.status(403).json({ status: 'error', message: 'Unauthorized. Owners cannot void transactions.' });
//       }

//       connection = await pool.getConnection();
//       await connection.beginTransaction();

//       const [orderRows] = await connection.query(
//         `SELECT id, status FROM orders 
//          WHERE id = ? AND branch_id = ? AND branch_id IN (
//            SELECT DISTINCT branch_id FROM branch_inventory WHERE organization_id = ?
//          )`, 
//         [id, branchId, organizationId]
//       );
//       if (orderRows.length === 0) {
//         await connection.rollback();
//         return res.status(404).json({ status: 'error', message: 'Order not found or unauthorized.' });
//       }

//       const order = orderRows[0];
//       const [items] = await connection.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id]);
      
//       if (order.status === 'completed' || order.status === 'partially_paid') {
//         for (const item of items) {
//           await connection.query(
//             'UPDATE branch_inventory SET stock = stock + ? WHERE product_id = ? AND branch_id = ?', 
//             [item.quantity, item.product_id, branchId]
//           );
//         }
//       }

//       await connection.query('DELETE FROM order_items WHERE order_id = ?', [id]);
//       await connection.query('DELETE FROM orders WHERE id = ?', [id]);

//       await connection.commit();
//       return res.status(200).json({ status: 'success', message: 'Transaction record cleared completely.' });

//     } catch (error) {
//       if (connection) await connection.rollback();
//       return res.status(500).json({ status: 'error', message: error.message });
//     } finally {
//       if (connection) connection.release();
//     }
//   }
// };

// module.exports = posController;


const pool = require('../config/db'); 

const posController = {
  createTransaction: async (req, res) => {
    let connection;
    try {
      const { cart, totalAmount } = req.body;
      const { id: userId, branchId, organizationId, role } = req.user;

      if (role === 'owner') {
        return res.status(403).json({ status: 'error', message: 'Unauthorized. Owners cannot execute sale transactions.' });
      }

      if (!cart || Object.keys(cart).length === 0) {
        return res.status(400).json({ status: 'error', message: 'Cart items are missing.' });
      }

      const productIds = Object.keys(cart).map(id => Number(id));

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [products] = await connection.query(
        `SELECT p.id, p.name, p.price, bi.stock 
         FROM products p
         JOIN branch_inventory bi ON p.id = bi.product_id
         WHERE p.id IN (?) AND bi.branch_id = ? AND bi.organization_id = ?`,
        [productIds, branchId, organizationId]
      );

      if (products.length === 0) {
        await connection.rollback();
        return res.status(404).json({ status: 'error', message: 'Selected products not found in inventory.' });
      }

      for (const product of products) {
        const requestedQty = cart[product.id.toString()] || cart[product.id];
        if (product.stock < requestedQty) {
          await connection.rollback();
          return res.status(400).json({
            status: 'error',
            message: `${product.name} သည် လက်ကျန်မလုံလောက်ပါ။ (လက်ကျန်: ${product.stock})`
          });
        }
      }

      const [orderResult] = await connection.query(
        "INSERT INTO orders (user_id, branch_id, total_amount, amount_paid, change_amount, status, created_at) VALUES (?, ?, ?, 0.00, 0.00, 'pending', NOW())",
        [userId, branchId, totalAmount]
      );
      const newOrderId = orderResult.insertId;

      for (const product of products) {
        const requestedQty = cart[product.id.toString()] || cart[product.id];
        await connection.query(
          'INSERT INTO order_items (order_id, product_id, quantity, price_at_sale) VALUES (?, ?, ?, ?)',
          [newOrderId, product.id, requestedQty, product.price]
        );
      }

      await connection.commit();
      return res.status(201).json({
        status: 'success',
        message: 'Pending statement setup successful.',
        orderId: newOrderId,
        totalAmount: totalAmount
      });

    } catch (error) {
      if (connection) await connection.rollback();
      return res.status(500).json({ status: 'error', message: error.message });
    } finally {
      if (connection) connection.release();
    }
  },

  confirmPayment: async (req, res) => {
    let connection;
    try {
      const { id } = req.params;
      const { paymentMethod, billingMode, amountPaid, receivedCash } = req.body;
      const { branchId, organizationId } = req.user;

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [orderRows] = await connection.query(
        `SELECT id, total_amount, status FROM orders 
         WHERE id = ? AND branch_id = ? AND branch_id IN (
           SELECT DISTINCT branch_id FROM branch_inventory WHERE organization_id = ?
         )`,
        [id, branchId, organizationId]
      );

      if (orderRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ status: 'error', message: 'Order reference log target file not found.' });
      }

      const order = orderRows[0];
      if (order.status === 'completed' || order.status === 'partially_paid') {
        await connection.rollback();
        return res.status(400).json({ status: 'error', message: 'This order transaction has already been cleared.' });
      }

      const verifiedAmountPaid = parseFloat(amountPaid) || 0;
      const targetTotal = parseFloat(order.total_amount);

      if (billingMode === 'full' && verifiedAmountPaid < targetTotal) {
        await connection.rollback();
        return res.status(400).json({ status: 'error', message: 'စရန်ငွေမဟုတ်ပါက ကျသင့်ငွေအပြည့်အဝ ပေးချေရန် လိုအပ်ပါသည်။' });
      }

      let changeAmount = 0.00;
      if (paymentMethod === 'cash' && receivedCash) {
        const verifiedReceivedCash = parseFloat(receivedCash) || 0;
        if (verifiedReceivedCash >= verifiedAmountPaid) {
          changeAmount = verifiedReceivedCash - verifiedAmountPaid;
        }
      }

      const [items] = await connection.query(
        `SELECT oi.product_id, oi.quantity, p.name, bi.stock 
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         JOIN branch_inventory bi ON p.id = bi.product_id
         WHERE oi.order_id = ? AND bi.branch_id = ? FOR UPDATE`,
        [id, branchId]
      );

      for (const item of items) {
        if (item.stock < item.quantity) {
          await connection.rollback();
          return res.status(400).json({
            status: 'error',
            message: `ငွေမချေနိုင်ပါ။ ${item.name} သည် လက်ကျန်မလုံလောက်တော့ပါ။ (လက်ကျန်: ${item.stock})`
          });
        }
      }

      for (const item of items) {
        await connection.query(
          'UPDATE branch_inventory SET stock = stock - ? WHERE product_id = ? AND branch_id = ?',
          [item.quantity, item.product_id, branchId]
        );
      }

      const finalizedStatus = billingMode === 'split' ? 'partially_paid' : 'completed';

      await connection.query(
        "UPDATE orders SET status = ?, payment_type = ?, amount_paid = ?, change_amount = ? WHERE id = ?",
        [finalizedStatus, paymentMethod, verifiedAmountPaid, changeAmount, id]
      );

      await connection.commit();
      return res.status(200).json({
        status: 'success',
        message: finalizedStatus === 'partially_paid' ? 'စရန်ငွေ လက်ခံရရှိပြီးပါပြီ।' : 'ငွေပေးချေမှု လုပ်ငန်းစဉ် ပြီးမြောက်သွားပါပြီ။',
        changeAmount: changeAmount
      });

    } catch (error) {
      if (connection) await connection.rollback();
      return res.status(500).json({ status: 'error', message: error.message });
    } finally {
      if (connection) connection.release();
    }
  },

  /*
  getReceiptsByDate: async (req, res) => {
    try {
      const { date } = req.query;
      const { branchId } = req.user;

      if (!date) {
        return res.status(400).json({ status: 'error', message: 'Date parameter is required.' });
      }

      const [rows] = await pool.query(
        `SELECT id, 
                CAST(total_amount AS SIGNED) AS total, 
                IF(status = 'partially_paid', 'split', 'full') AS mode, 
                CAST(amount_paid AS SIGNED) AS paid, 
                CAST(change_amount AS SIGNED) AS change_returned,
                payment_type AS method, 
                DATE_FORMAT(created_at, '%H:%i') AS time
         FROM orders 
         WHERE branch_id = ? 
           AND DATE(created_at) = ? 
           AND status IN ('completed', 'partially_paid')
         ORDER BY created_at DESC`,
        [branchId, date]
      );

      return res.status(200).json({
        status: 'success',
        data: rows
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  },
*/

getReceiptsByDate: async (req, res) => {
    try {
      const { date } = req.query;
      const { branchId } = req.user;

      if (!date) {
        return res.status(400).json({ status: 'error', message: 'Date parameter is required.' });
      }

      const [orders] = await pool.query(
        `SELECT id, 
                CAST(total_amount AS SIGNED) AS total, 
                IF(status = 'partially_paid', 'split', 'full') AS mode, 
                CAST(amount_paid AS SIGNED) AS paid, 
                CAST(change_amount AS SIGNED) AS change_returned,
                payment_type AS method, 
                DATE_FORMAT(created_at, '%H:%i') AS time
         FROM orders 
         WHERE branch_id = ? 
           AND DATE(created_at) = ? 
           AND status IN ('completed', 'partially_paid')
         ORDER BY created_at DESC`,
        [branchId, date]
      );

      if (orders.length === 0) {
        return res.status(200).json({ status: 'success', data: [] });
      }

      const orderIds = orders.map(o => o.id);

      const [items] = await pool.query(
        `SELECT oi.order_id, oi.product_id, p.name, oi.quantity, oi.price_at_sale 
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id IN (?)`,
        [orderIds]
      );

      const data = orders.map(order => ({
        ...order,
        items: items.filter(item => item.order_id === order.id).map(item => ({
          product_id: item.product_id,
          name: item.name,
          quantity: item.quantity,
          price: item.price_at_sale
        }))
      }));

      return res.status(200).json({
        status: 'success',
        data: data
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  },


  printReceipt: async (req, res) => {
    try {
      const { id } = req.params;
      return res.status(200).json({
        status: 'success',
        message: 'Receipt format configuration processed successfully.'
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  },

  getTransactionDetail: async (req, res) => {
    try {
      const { id } = req.params;
      const { organizationId, branchId, role } = req.user;
      
      let orderQuery = `
        SELECT o.* FROM orders o
        WHERE o.id = ? AND o.branch_id IN (
          SELECT DISTINCT branch_id FROM branch_inventory WHERE organization_id = ?
        )
      `;
      let queryParams = [id, organizationId];

      if (role === 'employee') {
        orderQuery += ' AND o.branch_id = ?';
        queryParams.push(branchId);
      }

      const [orderRows] = await pool.query(orderQuery, queryParams);
      if (orderRows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Transaction record log not found or unauthorized.' });
      }

      const [itemRows] = await pool.query(
        `SELECT oi.id, oi.product_id, p.name, oi.quantity, oi.price_at_sale 
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
         [id]
      );

      return res.status(200).json({
        status: 'success',
        order: orderRows[0],
        items: itemRows
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  },

  deleteTransaction: async (req, res) => {
    let connection;
    try {
      const { id } = req.params;
      const { branchId, organizationId, role } = req.user;

      if (role === 'owner') {
        return res.status(403).json({ status: 'error', message: 'Unauthorized. Owners cannot void transactions.' });
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [orderRows] = await connection.query(
        `SELECT id, status FROM orders 
         WHERE id = ? AND branch_id = ? AND branch_id IN (
           SELECT DISTINCT branch_id FROM branch_inventory WHERE organization_id = ?
         )`, 
        [id, branchId, organizationId]
      );
      if (orderRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ status: 'error', message: 'Order not found or unauthorized.' });
      }

      const order = orderRows[0];
      const [items] = await connection.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id]);
      
      if (order.status === 'completed' || order.status === 'partially_paid') {
        for (const item of items) {
          await connection.query(
            'UPDATE branch_inventory SET stock = stock + ? WHERE product_id = ? AND branch_id = ?', 
            [item.quantity, item.product_id, branchId]
          );
        }
      }

      await connection.query('DELETE FROM order_items WHERE order_id = ?', [id]);
      await connection.query('DELETE FROM orders WHERE id = ?', [id]);

      await connection.commit();
      return res.status(200).json({ status: 'success', message: 'Transaction record cleared completely.' });

    } catch (error) {
      if (connection) await connection.rollback();
      return res.status(500).json({ status: 'error', message: error.message });
    } finally {
      if (connection) connection.release();
    }
  }
};

module.exports = posController;