import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { toast } from 'react-toastify';

/**
 * Authentication Context
 * 
 * Manages user authentication state, token handling, and API authentication.
 * Provides login, logout, and token refresh functionality.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Action types
const AUTH_ACTIONS = {
    LOGIN_START: 'LOGIN_START',
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_ERROR: 'LOGIN_ERROR',
    LOGOUT: 'LOGOUT',
    REFRESH_TOKEN: 'REFRESH_TOKEN',
    SET_LOADING: 'SET_LOADING'
};

// Initial state
const initialState = {
    user: null,
    accessToken: null,
    refreshToken: null,
    loading: true,
    error: null
};

// Auth reducer
const authReducer = (state, action) => {
    switch (action.type) {
        case AUTH_ACTIONS.LOGIN_START:
            return {
                ...state,
                loading: true,
                error: null
            };

        case AUTH_ACTIONS.LOGIN_SUCCESS:
            return {
                ...state,
                user: action.payload.user,
                accessToken: action.payload.accessToken,
                refreshToken: action.payload.refreshToken,
                loading: false,
                error: null
            };

        case AUTH_ACTIONS.LOGIN_ERROR:
            return {
                ...state,
                user: null,
                accessToken: null,
                refreshToken: null,
                loading: false,
                error: action.payload
            };

        case AUTH_ACTIONS.LOGOUT:
            return {
                ...state,
                user: null,
                accessToken: null,
                refreshToken: null,
                loading: false,
                error: null
            };

        case AUTH_ACTIONS.REFRESH_TOKEN:
            return {
                ...state,
                accessToken: action.payload.accessToken,
                error: null
            };

        case AUTH_ACTIONS.SET_LOADING:
            return {
                ...state,
                loading: action.payload
            };

        default:
            return state;
    }
};

// Create context
const AuthContext = createContext();

// Auth provider component
export const AuthProvider = ({ children }) => {
    const [state, dispatch] = useReducer(authReducer, initialState);

    // Load stored auth data on mount
    useEffect(() => {
        const loadStoredAuth = () => {
            try {
                const storedUser = localStorage.getItem('dashboard_user');
                const storedAccessToken = localStorage.getItem('dashboard_access_token');
                const storedRefreshToken = localStorage.getItem('dashboard_refresh_token');

                if (storedUser && storedAccessToken && storedRefreshToken) {
                    dispatch({
                        type: AUTH_ACTIONS.LOGIN_SUCCESS,
                        payload: {
                            user: JSON.parse(storedUser),
                            accessToken: storedAccessToken,
                            refreshToken: storedRefreshToken
                        }
                    });
                } else {
                    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
                }
            } catch (error) {
                console.error('Error loading stored auth:', error);
                dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
            }
        };

        loadStoredAuth();
    }, []);

    // Setup token refresh timer
    useEffect(() => {
        if (state.accessToken) {
            // Decode JWT to get expiration time
            try {
                const payload = JSON.parse(atob(state.accessToken.split('.')[1]));
                const expirationTime = payload.exp * 1000; // Convert to milliseconds
                const currentTime = Date.now();
                const refreshTime = expirationTime - currentTime - (2 * 60 * 1000); // Refresh 2 minutes before expiry

                if (refreshTime > 0) {
                    const timer = setTimeout(() => {
                        refreshAccessToken();
                    }, refreshTime);

                    return () => clearTimeout(timer);
                }
            } catch (error) {
                console.error('Error parsing access token:', error);
            }
        }
    }, [state.accessToken]);

    // Login function
    const login = async (username, password, provider = 'local') => {
        dispatch({ type: AUTH_ACTIONS.LOGIN_START });

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password, provider })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Store auth data
            localStorage.setItem('dashboard_user', JSON.stringify(data.user));
            localStorage.setItem('dashboard_access_token', data.accessToken);
            localStorage.setItem('dashboard_refresh_token', data.refreshToken);

            dispatch({
                type: AUTH_ACTIONS.LOGIN_SUCCESS,
                payload: data
            });

            toast.success(`Welcome back, ${data.user.username}!`);
            
            return data;
        } catch (error) {
            const errorMessage = error.message || 'Login failed';
            
            dispatch({
                type: AUTH_ACTIONS.LOGIN_ERROR,
                payload: errorMessage
            });

            toast.error(errorMessage);
            throw error;
        }
    };

    // Logout function
    const logout = async () => {
        try {
            // Call logout endpoint if access token exists
            if (state.accessToken) {
                await fetch(`${API_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${state.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            console.error('Logout API error:', error);
            // Continue with logout even if API call fails
        }

        // Clear stored auth data
        localStorage.removeItem('dashboard_user');
        localStorage.removeItem('dashboard_access_token');
        localStorage.removeItem('dashboard_refresh_token');

        dispatch({ type: AUTH_ACTIONS.LOGOUT });
        toast.info('You have been logged out');
    };

    // Refresh access token
    const refreshAccessToken = async () => {
        if (!state.refreshToken) {
            logout();
            return null;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken: state.refreshToken })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Token refresh failed');
            }

            // Update stored access token
            localStorage.setItem('dashboard_access_token', data.accessToken);

            dispatch({
                type: AUTH_ACTIONS.REFRESH_TOKEN,
                payload: data
            });

            return data.accessToken;
        } catch (error) {
            console.error('Token refresh error:', error);
            logout(); // Force logout on refresh failure
            return null;
        }
    };

    // Get authenticated headers for API requests
    const getAuthHeaders = () => {
        if (state.accessToken) {
            return {
                'Authorization': `Bearer ${state.accessToken}`,
                'Content-Type': 'application/json'
            };
        }
        return {
            'Content-Type': 'application/json'
        };
    };

    // Authenticated fetch wrapper
    const authenticatedFetch = async (url, options = {}) => {
        const headers = {
            ...getAuthHeaders(),
            ...options.headers
        };

        let response = await fetch(url, {
            ...options,
            headers
        });

        // Handle token expiration
        if (response.status === 401 && state.refreshToken) {
            const newToken = await refreshAccessToken();
            
            if (newToken) {
                // Retry request with new token
                response = await fetch(url, {
                    ...options,
                    headers: {
                        ...options.headers,
                        'Authorization': `Bearer ${newToken}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        }

        return response;
    };

    // Check if user is authenticated
    const isAuthenticated = () => {
        return !!(state.user && state.accessToken);
    };

    // Context value
    const value = {
        // State
        user: state.user,
        loading: state.loading,
        error: state.error,
        isAuthenticated: isAuthenticated(),

        // Actions
        login,
        logout,
        refreshAccessToken,
        authenticatedFetch,
        getAuthHeaders
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook to use auth context
export const useAuth = () => {
    const context = useContext(AuthContext);
    
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    
    return context;
};

export default AuthContext;