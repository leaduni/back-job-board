const authService = require('../services/auth.service');

const register = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email y password son requeridos.' });
        }
        
        // El servicio espera confirm-password, lo añadimos
        const userData = { ...req.body, 'confirm-password': password };

        const result = await authService.register(userData);
        res.status(201).json(result);
    } catch (error) {
        // Usamos el mensaje de error específico del servicio
        res.status(400).json({ message: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email y password son requeridos.' });
        }
        const result = await authService.login(email, password);
        res.status(200).json(result);
    } catch (error) {
        // Usamos el mensaje de error específico del servicio
        res.status(401).json({ message: error.message });
    }
};

module.exports = {
    register,
    login,
};
