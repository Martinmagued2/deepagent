import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Chart from 'chart.js/auto';

// Expense Tracker Application
function ExpenseTracker() {
  const [expenses, setExpenses] = useState([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('food');
  const [editingId, setEditingId] = useState(null);
  const [chartData, setChartData] = useState({ labels: [], data: [] });

  // Load expenses from localStorage on initial render
  useEffect(() => {
    const savedExpenses = localStorage.getItem('expenses');
    if (savedExpenses) {
      setExpenses(JSON.parse(savedExpenses));
    }
    updateChartData();
  }, []);

  // Save expenses to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('expenses', JSON.stringify(expenses));
    updateChartData();
  }, [expenses]);

  // Update chart data based on current expenses
  const updateChartData = () => {
    const categoryTotals = {};
    expenses.forEach(expense => {
      categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + parseFloat(expense.amount);
    });
    
    setChartData({
      labels: Object.keys(categoryTotals),
      data: Object.values(categoryTotals)
    });
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!description.trim() || !amount) {
      alert('Please fill in all fields');
      return;
    }

    const newExpense = {
      id: Date.now(),
      description: description.trim(),
      amount: parseFloat(amount),
      category,
      date: new Date().toISOString()
    };

    if (editingId) {
      // Update existing expense
      setExpenses(expenses.map(expense => 
        expense.id === editingId ? newExpense : expense
      ));
      setEditingId(null);
    } else {
      // Add new expense
      setExpenses([...expenses, newExpense]);
    }

    // Reset form
    setDescription('');
    setAmount('');
    setCategory('food');
  };

  // Handle edit expense
  const handleEdit = (expense) => {
    setDescription(expense.description);
    setAmount(expense.amount.toString());
    setCategory(expense.category);
    setEditingId(expense.id);
  };

  // Handle delete expense
  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      setExpenses(expenses.filter(expense => expense.id !== id));
    }
  };

  // Calculate total expenses
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Expense Tracker</h1>
          <p className="text-gray-600">Track your spending and visualize your expenses</p>
        </header>

        {/* Add/Edit Expense Form */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">{editingId ? 'Edit Expense' : 'Add New Expense'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter expense description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter amount"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="food">Food & Dining</option>
                <option value="transport">Transportation</option>
                <option value="shopping">Shopping</option>
                <option value="entertainment">Entertainment</option>
                <option value="bills">Bills & Utilities</option>
                <option value="health">Health & Fitness</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setDescription('');
                  setAmount('');
                  setCategory('food');
                  setEditingId(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 mr-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                {editingId ? 'Update Expense' : 'Add Expense'}
              </button>
            </div>
          </form>
        </div>

        {/* Expenses Summary */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Expenses Summary</h2>
            <span className="text-2xl font-bold text-green-600">${totalExpenses.toFixed(2)}</span>
          </div>
          
          {/* Chart */}
          {chartData.labels.length > 0 && (
            <div className="h-64 mb-6">
              <canvas id="expenseChart"></canvas>
            </div>
          )}
          
          {/* Empty state */}
          {expenses.length === 0 && (
            <p className="text-center text-gray-500 py-8">No expenses yet. Add your first expense above!</p>
          )}
        </div>

        {/* Expenses List */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold mb-6">All Expenses</h2>
          
          {expenses.length > 0 ? (
            <div className="space-y-4">
              {expenses
                .sort((a, b) => new Date(b.date) - new Date(a.date)) // Newest first
                .map((expense) => (
                  <div key={expense.id} className="border-b pb-4 last:border-b-0 last:pb-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-800">{expense.description}</h3>
                        <p className="text-sm text-gray-500">
                          {expense.category} • {new Date(expense.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right space-x-2">
                        <span className="font-bold text-red-600">${expense.amount.toFixed(2)}</span>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(expense)}
                            className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs rounded hover:bg-yellow-200"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(expense.id)}
                            className="px-3 py-1 bg-red-100 text-red-800 text-xs rounded hover:bg-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-8">No expenses to display</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-sm text-gray-500">
        Expense Tracker • Built with React & Tailwind CSS
      </footer>
    </div>
  );
}

// Initialize the app
const root = createRoot(document.getElementById('root'));
root.render(<ExpenseTracker />);