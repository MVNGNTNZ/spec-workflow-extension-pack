import React from 'react';
import './LoadingSpinner.css';

/**
 * Loading Spinner Component
 * 
 * Displays a loading spinner with optional message.
 */
const LoadingSpinner = ({ message = 'Loading...', size = 'medium' }) => {
    return (
        <div className={`loading-spinner-container ${size}`}>
            <div className="loading-spinner">
                <div className="spinner"></div>
            </div>
            {message && <p className="loading-message">{message}</p>}
        </div>
    );
};

export default LoadingSpinner;