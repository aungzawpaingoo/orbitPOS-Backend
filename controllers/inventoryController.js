const pool = require('../config/db');

exports.getInventoryDashboard = async (req, res) => {
    const { organizationId, role, branchId: userBranchId } = req.user;
    const { search, branchFilter } = req.query;

    try {
        let queryParams = [organizationId];
        let branchCondition = '';

        if (role === 'owner') {
            if (branchFilter) {
                branchCondition = ` AND bi.branch_id = ?`;
                queryParams.push(branchFilter);
            }
        } else {
            branchCondition = ` AND bi.branch_id = ?`;
            queryParams.push(userBranchId);
        }

        let searchCondition = '';
        if (search) {
            searchCondition = ` AND (p.name LIKE ? OR p.sku LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        let metricsParams = [...queryParams];

        const [metrics] = await pool.query(`
            SELECT 
                COUNT(DISTINCT p.id) as totalProducts,
                IFNULL(SUM(bi.stock), 0) as totalStock,
                IFNULL(SUM(bi.stock * p.price), 0) as totalValue
            FROM branch_inventory bi
            JOIN products p ON bi.product_id = p.id
            WHERE bi.organization_id = ? ${branchCondition}
        `, metricsParams);

        const [products] = await pool.query(`
            SELECT 
                p.id, 
                p.name, 
                p.sku, 
                p.price, 
                p.image_url,
                p.category,
                SUM(bi.stock) as stock
            FROM branch_inventory bi
            JOIN products p ON bi.product_id = p.id
            WHERE bi.organization_id = ? ${branchCondition} ${searchCondition}
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `, queryParams);

        res.status(200).json({
            status: 'success',
            scope: role === 'owner' && !branchFilter ? 'all_branches' : 'specific_branch',
            metrics: {
                totalProducts: metrics[0].totalProducts,
                totalStock: parseInt(metrics[0].totalStock),
                totalValue: parseFloat(metrics[0].totalValue)
            },
            products
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.addProduct = async (req, res) => {
    const { organizationId, branchId: userBranchId, role } = req.user;
    const { name, price, stock, targetBranchId, category } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        let activeBranchId = (role === 'owner' && targetBranchId) ? targetBranchId : userBranchId;

        const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 4);
        const uniqueString = Math.floor(1000 + Math.random() * 9000);
        const generatedSku = `${cleanName}-${uniqueString}`;

        const imageUrl = req.file ? `/uploads/${organizationId}/${req.file.filename}` : null;

        const [productResult] = await connection.query(
            'INSERT INTO products (organization_id, name, sku, price, image_url, category) VALUES (?, ?, ?, ?, ?, ?)',
            [organizationId, name, generatedSku, price, imageUrl, category]
        );
        const productId = productResult.insertId;

        await connection.query(
            'INSERT INTO branch_inventory (organization_id, branch_id, product_id, stock) VALUES (?, ?, ?, ?)',
            [organizationId, activeBranchId, productId, stock || 0]
        );

        await connection.commit();
        res.status(201).json({ 
            status: 'success', 
            message: 'Product mapped to inventory successfully', 
            sku: generatedSku,
            assignedBranchId: activeBranchId,
            imageUrl: imageUrl
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        connection.release();
    }
};

exports.updateProduct = async (req, res) => {
    const { organizationId, branchId: userBranchId, role } = req.user;
    const { id } = req.params; 
    const { name, price, stock, targetBranchId, category } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [productCheck] = await connection.query(
            'SELECT id FROM products WHERE id = ? AND organization_id = ?',
            [id, organizationId]
        );

        if (productCheck.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Product not found in your organization.' });
        }

        let updateFields = [];
        let updateParams = [];

        if (name) { updateFields.push('name = ?'); updateParams.push(name); }
        if (price) { updateFields.push('price = ?'); updateParams.push(price); }
        if (category) { updateFields.push('category = ?'); updateParams.push(category); }

        if (req.file) { 
            const imageUrl = `/uploads/${organizationId}/${req.file.filename}`;
            updateFields.push('image_url = ?'); 
            updateParams.push(imageUrl); 
        }

        if (updateFields.length > 0) {
            updateParams.push(id);
            await connection.query(
                `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
                updateParams
            );
        }

        if (stock !== undefined) {
            let activeBranchId = (role === 'owner' && targetBranchId) ? targetBranchId : userBranchId;

            await connection.query(`
                INSERT INTO branch_inventory (organization_id, branch_id, product_id, stock) 
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE stock = VALUES(stock)
            `, [organizationId, activeBranchId, id, stock]);
        }

        await connection.commit();
        res.status(200).json({ status: 'success', message: 'Product inventory updated successfully.' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        connection.release();
    }
};

exports.deleteProduct = async (req, res) => {
    const { organizationId } = req.user;
    const { id } = req.params;

    try {
        const [result] = await pool.query(
            'DELETE FROM products WHERE id = ? AND organization_id = ?',
            [id, organizationId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: 'error', message: 'Product not found or unauthorized.' });
        }

        res.status(200).json({ status: 'success', message: 'Product dropped from inventory catalog.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};