const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 1. Tenant Registration: Registers a brand new Organization, Main Branch, and its primary Admin Owner
exports.registerOwner = async (req, res) => {
    const { orgName, orgEmail, orgPhone, ownerName, ownerEmail, ownerPassword } = req.body;
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const [orgResult] = await connection.query(
            'INSERT INTO organizations (name, email, phone) VALUES (?, ?, ?)',
            [orgName, orgEmail, orgPhone]
        );
        const organizationId = orgResult.insertId;

        const [branchResult] = await connection.query(
            'INSERT INTO branches (organization_id, name) VALUES (?, ?)',
            [organizationId, 'Main Branch']
        );
        const branchId = branchResult.insertId;

        const passwordHash = await bcrypt.hash(ownerPassword, 10);

        await connection.query(
            'INSERT INTO users (organization_id, branch_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
            [organizationId, branchId, ownerName, ownerEmail, passwordHash, 'owner']
        );

        await connection.commit();
        res.status(201).json({ status: 'success', message: 'Organization and owner registered successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        connection.release();
    }
};

// 2. Main Login Gate: Generates identity tokens containing user role and sandboxed branch contexts
exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ? AND status = "active"', [email]);
        if (users.length === 0) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, organizationId: user.organization_id, branchId: user.branch_id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        const refreshToken = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, refreshToken, expiresAt]
        );

        res.status(200).json({
            status: 'success',
            token,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                organizationId: user.organization_id,
                branchId: user.branch_id
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 3. Create Employee Staff (RBAC Secure: Only active owners can invoke this)
exports.createEmployee = async (req, res) => {
    const { organizationId, role } = req.user; 
    const { name, email, password, branchId } = req.body;

    if (role !== 'owner') {
        return res.status(403).json({ status: 'error', message: 'Access denied. Only owners can add staff.' });
    }

    try {
        // Enforce basic validation to verify the target branch belongs to this owner's company
        const [branchCheck] = await pool.query(
            'SELECT id FROM branches WHERE id = ? AND organization_id = ?',
            [branchId, organizationId]
        );

        if (branchCheck.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Target branch does not exist within your organization.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        await pool.query(
            'INSERT INTO users (organization_id, branch_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, "employee")',
            [organizationId, branchId, name, email, passwordHash]
        );

        res.status(201).json({ status: 'success', message: 'Employee profile registered successfully.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 4. Update Organization Info
exports.updateOrganization = async (req, res) => {
    const { organizationId, role } = req.user;
    const { id } = req.params;
    const { name, email, phone } = req.body;

    if (role !== 'owner' || parseInt(id) !== organizationId) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized modification attempt.' });
    }

    try {
        await pool.query(
            'UPDATE organizations SET name = ?, email = ?, phone = ? WHERE id = ?',
            [name, email, phone, id]
        );
        res.status(200).json({ status: 'success', message: 'Organization updated successfully' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 5. Create Additional Branch Outlets
exports.createBranch = async (req, res) => {
    const { organizationId, role } = req.user;
    const { name, address, phone } = req.body;

    if (role !== 'owner') {
        return res.status(403).json({ status: 'error', message: 'Only organization owners can provision branches.' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO branches (organization_id, name, address, phone) VALUES (?, ?, ?, ?)',
            [organizationId, name, address, phone]
        );
        res.status(201).json({ 
            status: 'success', 
            message: 'New branch created successfully', 
            branchId: result.insertId 
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 6. Update Branch Details
exports.updateBranch = async (req, res) => {
    const { organizationId, role } = req.user;
    const { id } = req.params;
    const { name, address, phone, status } = req.body;

    if (role !== 'owner') {
        return res.status(403).json({ status: 'error', message: 'Forbidden.' });
    }

    try {
        const [branch] = await pool.query('SELECT id FROM branches WHERE id = ? AND organization_id = ?', [id, organizationId]);
        if (branch.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Branch profile missing within your organization.' });
        }

        await pool.query(
            'UPDATE branches SET name = ?, address = ?, phone = ?, status = ? WHERE id = ?',
            [name, address, phone, status, id]
        );
        res.status(200).json({ status: 'success', message: 'Branch updated successfully' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};


// 7. Get Current User Profile Data (Decodes JWT context to fetch fresh profile properties)
exports.getProfile = async (req, res) => {
    // req.user is safely populated by our verifyToken middleware
    const { id } = req.user; 

    try {
        const [users] = await pool.query(`
            SELECT 
                u.id, 
                u.name, 
                u.email, 
                u.role, 
                u.status,
                u.organization_id as organizationId, 
                u.branch_id as branchId,
                o.name as organizationName,
                b.name as branchName
            FROM users u
            JOIN organizations o ON u.organization_id = o.id
            JOIN branches b ON u.branch_id = b.id
            WHERE u.id = ? AND u.status = 'active'
        `, [id]);

        if (users.length === 0) {
            return res.status(404).json({ status: 'error', message: 'User profile not found or inactive.' });
        }

        res.status(200).json({
            status: 'success',
            user: users[0]
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.refreshToken = async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(401).json({ status: 'error', message: 'Refresh token is required.' });
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

        const [tokenRows] = await pool.query(
            'SELECT * FROM refresh_tokens WHERE user_id = ? AND token = ? AND expires_at > NOW()',
            [decoded.id, refreshToken]
        );

        if (tokenRows.length === 0) {
            return res.status(403).json({ status: 'error', message: 'Invalid or expired refresh session.' });
        }

        const [users] = await pool.query('SELECT * FROM users WHERE id = ? AND status = "active"', [decoded.id]);
        if (users.length === 0) {
            return res.status(404).json({ status: 'error', message: 'User profile no longer active.' });
        }

        const user = users[0];

        const newToken = jwt.sign(
            { id: user.id, organizationId: user.organization_id, branchId: user.branch_id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.status(200).json({
            status: 'success',
            token: newToken
        });

    } catch (error) {
        res.status(403).json({ status: 'error', message: 'Session expired. Please log in again.' });
    }
};