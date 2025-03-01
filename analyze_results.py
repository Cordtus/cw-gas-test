import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from scipy import stats

# Read the CSV file
df = pd.read_csv('gas_results.csv')

# Check if we have numeric data to analyze
numeric_rows = df[df['Message Length'].str.isnumeric()]

if not numeric_rows.empty:
    # Convert to numeric for analysis
    numeric_rows['Message Length'] = pd.to_numeric(numeric_rows['Message Length'])
    numeric_rows['Gas Used'] = pd.to_numeric(numeric_rows['Gas Used'])
    
    # Sort by message length for better visualization
    numeric_rows = numeric_rows.sort_values('Message Length')
    
    # Calculate linear regression
    slope, intercept, r_value, p_value, std_err = stats.linregress(
        numeric_rows['Message Length'], numeric_rows['Gas Used']
    )
    
    # Create prediction line
    x_pred = np.linspace(0, numeric_rows['Message Length'].max() * 1.1, 100)
    y_pred = intercept + slope * x_pred
    
    # Create the scatter plot
    plt.figure(figsize=(12, 8))
    
    # Main plot - all data
    plt.subplot(2, 1, 1)
    plt.scatter(numeric_rows['Message Length'], numeric_rows['Gas Used'], alpha=0.7)
    plt.plot(x_pred, y_pred, 'r--', label=f'y = {intercept:.2f} + {slope:.2f}x (R² = {r_value**2:.4f})')
    
    plt.title('Gas Usage vs Message Length')
    plt.xlabel('Message Length (bytes)')
    plt.ylabel('Gas Used')
    plt.legend()
    plt.grid(True)
    
    # Zoomed in plot - focusing on smaller message lengths
    plt.subplot(2, 1, 2)
    small_df = numeric_rows[numeric_rows['Message Length'] <= 200]
    
    if not small_df.empty:
        # Re-calculate regression for small messages
        small_slope, small_intercept, small_r, _, _ = stats.linregress(
            small_df['Message Length'], small_df['Gas Used']
        )
        
        small_x_pred = np.linspace(0, 200, 100)
        small_y_pred = small_intercept + small_slope * small_x_pred
        
        plt.scatter(small_df['Message Length'], small_df['Gas Used'], alpha=0.7)
        plt.plot(small_x_pred, small_y_pred, 'g--', 
                 label=f'y = {small_intercept:.2f} + {small_slope:.2f}x (R² = {small_r**2:.4f})')
        
        plt.title('Gas Usage (Small Messages)')
        plt.xlabel('Message Length (bytes)')
        plt.ylabel('Gas Used')
        plt.legend()
        plt.grid(True)
    
    plt.tight_layout()
    plt.savefig('gas_analysis.png')
    
    # Calculate gas cost per byte
    print("Gas Regression Analysis:")
    print(f"Base gas cost: {intercept:.2f} gas units")
    print(f"Marginal cost per byte: {slope:.2f} gas units")
    print(f"R-squared: {r_value**2:.4f}")
    
    if not small_df.empty:
        print("\nSmall Message Analysis (≤ 200 bytes):")
        print(f"Base gas cost: {small_intercept:.2f} gas units")
        print(f"Marginal cost per byte: {small_slope:.2f} gas units")
        print(f"R-squared: {small_r**2:.4f}")

# Analyze non-numeric special format data
format_rows = df[~df['Message Length'].str.isnumeric()]
if not format_rows.empty:
    print("\nSpecial Format Analysis:")
    print(format_rows)