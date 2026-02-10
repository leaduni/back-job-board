const axios = require('axios');
require('dotenv').config();

const CMS_API_URL = 'https://leaduni-cms.up.railway.app/api';

const register = async (userData) => {
  let adminToken;

  // Paso 1: Autenticación de Administrador
  try {
    const adminLoginResponse = await axios.post(`${CMS_API_URL}/users/login`, {
      email: process.env.CMS_ADMIN_EMAIL,
      password: process.env.CMS_ADMIN_PASSWORD,
    });
    adminToken = adminLoginResponse.data.token;
  } catch (error) {
    console.error('Error en el login de administrador:', error.response ? error.response.data : error.message);
    throw new Error('Error en la autenticación interna del administrador.');
  }

  // Paso 2: Creación de Usuario
  let newUser;
  try {
    const createUserResponse = await axios.post(`${CMS_API_URL}/users?depth=0&fallback-locale=null`, {
      ...userData,
      role: 'user',
    }, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
    });
    newUser = createUserResponse.data.doc;
  } catch (error) {
    console.error('Error en la creación de usuario:', error.response ? error.response.data : error.message);
    if (error.response && error.response.data && error.response.data.errors) {
        const emailError = error.response.data.errors.find(e => e.message.includes('email'));
        if (emailError) {
            throw new Error('El correo electrónico ya está registrado.');
        }
    }
    throw new Error('No se pudo crear el usuario.');
  }

  // Paso 3: Autenticación del Nuevo Usuario
  try {
    const userLoginResponse = await axios.post(`${CMS_API_URL}/users/login`, {
      email: userData.email,
      password: userData.password,
    });

    return {
      token: userLoginResponse.data.token,
      user: userLoginResponse.data.user,
    };
  } catch (error) {
    console.error('Error en el login del nuevo usuario:', error.response ? error.response.data : error.message);
    throw new Error('No se pudo autenticar al usuario recién creado.');
  }
};

const login = async (email, password) => {
  try {
    const response = await axios.post(`${CMS_API_URL}/users/login`, {
      email,
      password,
    });
    return {
      token: response.data.token,
      user: response.data.user,
    };
  } catch (error) {
    console.error('Error en el login:', error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 401) {
        throw new Error('Credenciales inválidas.');
    }
    throw new Error('Error al intentar iniciar sesión.');
  }
};

module.exports = {
  register,
  login,
};
