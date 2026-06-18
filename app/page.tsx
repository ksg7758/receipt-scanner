import React, { useState, useRef } from 'react';
import { Upload, Check, X, Loader } from 'lucide-react';

export default function ReceiptScanner() {
  const [step, setStep] = useState('upload'); // upload, review, saving, success
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [processingResults, setProcessingResults] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingAmount, setEditingAmount] = useState(false);
  const [editingCategory, setEditingCategory] = useState(false);
  const [editingManually, setEditingManually] = useState(false);
  const [tempAmount, setTempAmount] = useState('');
  const [tempCategory, setTempCategory] = useState('');
  const fileInputRef = useRef(null);

  const categories = [
    'maintenance',
    'electricity',
    'cable',
    'internet',
    'phone bills',
    'art supplies',
    'studio assistant',
    'postage/printing/shipping',
    'entertainment',
    'restaurant/food/grocery',
    'hospitality',
    'equipment/tools/electronic devices',
    'donations',
    'medical',
    'office expense (general OP)',
    'travel expense',
    'local transport/car rental, services',
    'lot',
    'other',
    'Legal',
    'telephone',
    'IRS',
    'Insurance',
    'Tax preparation',
  ];

  // Handle file upload and convert to base64
  const handleFileUpload = (files) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    let filesProcessed = 0;
    const newFiles = [];

    fileArray.forEach((file) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const base64Data = e.target.result;

        if (!base64Data) {
          console.error('Failed to read file:', file.name);
          filesProcessed++;
          return;
        }

        newFiles.push({
          id: Math.random(),
          base64: base64Data,
          name: file.name,
        });

        filesProcessed++;
        if (filesProcessed === fileArray.length) {
          setUploadedFiles([...uploadedFiles, ...newFiles]);
        }
      };

      reader.onerror = (error) => {
        console.error('FileReader error:', error);
        filesProcessed++;
      };

      reader.readAsDataURL(file);
    });
  };

  const removeFile = (id) => {
    setUploadedFiles(uploadedFiles.filter((f) => f.id !== id));
  };

  // Process all receipts with Claude
  const handleConfirmUpload = async () => {
    if (uploadedFiles.length === 0) {
      setError('Please upload at least one receipt');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const results = [];

      for (const fileObj of uploadedFiles) {
        try {
          const base64Image = fileObj.base64.split(',')[1];

          if (!base64Image) {
            throw new Error('Could not extract base64 data from image');
          }

          // Detect media type from the data URL
          let mediaType = 'image/jpeg';
          if (fileObj.base64.includes('image/png')) {
            mediaType = 'image/png';
          } else if (fileObj.base64.includes('image/webp')) {
            mediaType = 'image/webp';
          } else if (fileObj.base64.includes('image/gif')) {
            mediaType = 'image/gif';
          }

          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 500,
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: mediaType,
                        data: base64Image,
                      },
                    },
                    {
                      type: 'text',
                      text: `Extract the following from this receipt and respond ONLY with valid JSON:
                      - total_amount (the final total, as a number)
                      - merchant (store/restaurant name)
                      - date (if visible, otherwise today's date in YYYY-MM-DD format)

                      Example: {"total_amount": 42.50, "merchant": "Whole Foods", "date": "2024-01-15"}

                      If you cannot read the receipt, return: {"error": "Could not read receipt"}`,
                    },
                  ],
                },
              ],
            }),
          });

          const data = await response.json();

          // Check for API errors
          if (data.error) {
            const errorMsg = data.error.message || JSON.stringify(data.error);
            results.push({
              id: fileObj.id,
              base64: fileObj.base64,
              error: `API Error: ${errorMsg}. This usually means the image format isn't supported or the API is rate limited. Try: JPG or PNG format, smaller file size, or try again in a moment.`,
              total_amount: '',
              merchant: '',
              date: new Date().toISOString().split('T')[0],
              category: '',
              status: 'error',
            });
            continue;
          }

          if (!data.content || !data.content[0]) {
            results.push({
              id: fileObj.id,
              base64: fileObj.base64,
              error: 'No response from Claude API - image may not have processed. Try using a JPG or PNG file instead.',
              total_amount: '',
              merchant: '',
              date: new Date().toISOString().split('T')[0],
              category: '',
              status: 'error',
            });
            continue;
          }

          const firstContent = data.content[0];
          if (!firstContent.text) {
            results.push({
              id: fileObj.id,
              base64: fileObj.base64,
              error: `Unexpected response format: ${firstContent.type || 'unknown type'}. Try with a standard JPG or PNG receipt image.`,
              total_amount: '',
              merchant: '',
              date: new Date().toISOString().split('T')[0],
              category: '',
              status: 'error',
            });
            continue;
          }

          let jsonText = data.content[0].text.trim();
          // Remove markdown formatting if present
          if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```json\n?|\n?```/g, '').trim();
          }

          let extracted;
          try {
            extracted = JSON.parse(jsonText);
          } catch (parseErr) {
            results.push({
              id: fileObj.id,
              base64: fileObj.base64,
              error: `Failed to parse Claude's response. Error: ${parseErr.message}. Response was: "${jsonText.substring(0, 150)}"`,
              total_amount: '',
              merchant: '',
              date: new Date().toISOString().split('T')[0],
              category: '',
              status: 'error',
            });
            continue;
          }

          if (extracted.error) {
            results.push({
              id: fileObj.id,
              base64: fileObj.base64,
              error: `Claude could not read receipt: ${extracted.error}. Try: Clear/well-lit photo, total amount visible, no blur.`,
              total_amount: '',
              merchant: '',
              date: new Date().toISOString().split('T')[0],
              category: '',
              status: 'error',
            });
          } else {
            results.push({
              id: fileObj.id,
              base64: fileObj.base64,
              total_amount: extracted.total_amount,
              merchant: extracted.merchant,
              date: extracted.date || new Date().toISOString().split('T')[0],
              category: '',
              status: 'pending',
            });
          }
        } catch (err) {
          console.error('Error processing file:', err);
          results.push({
            id: fileObj.id,
            base64: fileObj.base64,
            error: `Network or processing error: ${err.message}. Check internet connection and try again.`,
            total_amount: '',
            merchant: '',
            date: new Date().toISOString().split('T')[0],
            category: '',
            status: 'error',
          });
        }
      }

      setProcessingResults(results);
      setCurrentIndex(0);
      setStep('review');
      setLoading(false);
    } catch (err) {
      console.error('Error:', err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const currentResult = processingResults[currentIndex];

  // Save changes to current receipt
  const updateCurrentResult = (updates) => {
    const updated = [...processingResults];
    updated[currentIndex] = { ...updated[currentIndex], ...updates };
    setProcessingResults(updated);
  };

  const handleCorrect = () => {
    if (!currentResult.category) {
      setError('Please select a category');
      return;
    }
    if (!currentResult.total_amount || currentResult.total_amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setError('');
    setEditingAmount(false);
    setEditingCategory(false);
    setEditingManually(false);

    if (currentIndex < processingResults.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      saveAllExpenses();
    }
  };

  const handleIncorrect = () => {
    setTempAmount(currentResult.total_amount?.toString() || '');
    setTempCategory(currentResult.category || '');
    setEditingAmount(false);
    setEditingCategory(false);
    setEditingManually(true);
  };

  const handleSkipError = () => {
    if (currentIndex < processingResults.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setEditingManually(false);
    } else {
      saveAllExpenses();
    }
  };

  const saveAllExpenses = async () => {
    setStep('saving');
    setLoading(true);

    try {
      for (const result of processingResults) {
        if (result.status === 'pending' && result.category) {
          await fetch('/api/add-expense', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: result.date,
              merchant: result.merchant,
              amount: result.total_amount,
              category: result.category,
            }),
          });
        }
      }

      setStep('success');
      setLoading(false);

      setTimeout(() => {
        setStep('upload');
        setUploadedFiles([]);
        setProcessingResults([]);
        setCurrentIndex(0);
        setError('');
        setEditingAmount(false);
        setEditingCategory(false);
        setEditingManually(false);
        fileInputRef.current.value = '';
      }, 2000);
    } catch (err) {
      console.error('Error saving:', err);
      setError('Failed to save expenses. Please try again.');
      setStep('review');
      setLoading(false);
    }
  };

  // ===== UPLOAD STEP =====
  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center space-y-8">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Receipt Scanner</h1>
              <p className="text-lg text-gray-600">Upload multiple receipt photos</p>
            </div>

            <div className="flex justify-center">
              <Upload size={80} className="text-indigo-500" />
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-4 border-dashed border-indigo-300 rounded-xl p-8 cursor-pointer hover:border-indigo-500 transition bg-indigo-50"
            >
              <p className="text-gray-700 font-semibold text-lg">Tap to take photos</p>
              <p className="text-sm text-gray-500 mt-2">or select from your device</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="*"
              multiple
              capture="environment"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />

            {uploadedFiles.length > 0 && (
              <div className="space-y-4">
                <p className="text-gray-700 font-semibold">
                  {uploadedFiles.length} receipt{uploadedFiles.length !== 1 ? 's' : ''} uploaded
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-64 overflow-y-auto">
                  {uploadedFiles.map((fileObj) => (
                    <div key={fileObj.id} className="relative group">
                      {fileObj.base64 ? (
                        <img
                          src={fileObj.base64}
                          alt="Receipt preview"
                          className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
                          onError={(e) => {
                            console.error('Preview failed to load:', e);
                            e.target.style.background = '#e5e7eb';
                          }}
                        />
                      ) : (
                        <div className="w-full h-32 bg-gray-200 rounded-lg border-2 border-gray-200 flex items-center justify-center">
                          <span className="text-xs text-gray-500">Loading...</span>
                        </div>
                      )}
                      <button
                        onClick={() => removeFile(fileObj.id)}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold py-2 px-4 rounded-lg transition"
                >
                  Add more receipts
                </button>
              </div>
            )}

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {uploadedFiles.length > 0 && (
              <button
                onClick={handleConfirmUpload}
                disabled={loading}
                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-bold py-4 px-6 rounded-xl text-lg transition"
              >
                {loading ? 'Processing...' : 'Process Receipts'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===== REVIEW STEP =====
  if (step === 'review' && currentResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">
                Receipt {currentIndex + 1} of {processingResults.length}
              </p>
              <h2 className="text-2xl font-bold text-gray-900">Review Receipt</h2>
            </div>

            {/* Receipt Image Preview - Large and Clear */}
            <div className="border-4 border-indigo-300 rounded-lg overflow-hidden bg-gray-100 shadow-lg">
              {currentResult.base64 ? (
                <img
                  src={currentResult.base64}
                  alt="Receipt"
                  className="w-full max-h-96 object-contain bg-white"
                  onError={(e) => {
                    console.error('Image failed to load:', e);
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-96 bg-gray-200 flex items-center justify-center text-gray-500">
                  No image available
                </div>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-indigo-500">
              <p className="text-xs text-gray-600 font-semibold uppercase">Receipt Photo</p>
            </div>

            {/* ERROR STATE */}
            {currentResult.status === 'error' ? (
              <div className="space-y-4">
                <div className="bg-red-100 border-2 border-red-400 text-red-800 px-4 py-4 rounded-lg">
                  <p className="font-bold text-lg mb-2">⚠️ Could Not Read Receipt</p>
                  <p className="text-sm leading-relaxed">{currentResult.error}</p>
                </div>

                {!editingManually ? (
                  <div className="flex gap-4">
                    <button
                      onClick={handleSkipError}
                      className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-4 px-6 rounded-xl transition"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => setEditingManually(true)}
                      className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 px-6 rounded-xl transition"
                    >
                      Enter Manually
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 bg-indigo-50 rounded-lg p-6 border-2 border-indigo-400">
                    <p className="font-semibold text-gray-900">Enter Receipt Details</p>

                    <div>
                      <label className="text-sm text-gray-700 font-semibold">Amount</label>
                      <input
                        type="number"
                        value={tempAmount}
                        onChange={(e) => setTempAmount(e.target.value)}
                        step="0.01"
                        placeholder="0.00"
                        className="w-full text-2xl font-bold text-indigo-600 bg-white border-2 border-indigo-400 rounded-lg p-3 focus:outline-none mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-sm text-gray-700 font-semibold">Category</label>
                      <select
                        value={tempCategory}
                        onChange={(e) => setTempCategory(e.target.value)}
                        className="w-full text-lg font-semibold bg-white border-2 border-indigo-400 rounded-lg p-3 focus:outline-none mt-1"
                      >
                        <option value="">Select a category</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {error && (
                      <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">
                        {error}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingManually(false)}
                        className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold py-2 px-4 rounded-lg transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (!tempAmount || parseFloat(tempAmount) <= 0) {
                            setError('Please enter a valid amount');
                            return;
                          }
                          if (!tempCategory) {
                            setError('Please select a category');
                            return;
                          }
                          updateCurrentResult({
                            total_amount: parseFloat(tempAmount),
                            category: tempCategory,
                            status: 'pending',
                          });
                          setEditingManually(false);
                          setError('');
                        }}
                        className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : editingManually ? (
              // MANUAL EDIT MODE
              <div className="space-y-4 bg-indigo-50 rounded-lg p-6 border-2 border-indigo-400">
                <p className="font-semibold text-gray-900">Edit Receipt</p>

                <div>
                  <label className="text-sm text-gray-700 font-semibold">Amount</label>
                  <input
                    type="number"
                    value={tempAmount}
                    onChange={(e) => setTempAmount(e.target.value)}
                    step="0.01"
                    autoFocus
                    className="w-full text-2xl font-bold text-indigo-600 bg-white border-2 border-indigo-400 rounded-lg p-3 focus:outline-none mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-700 font-semibold">Category</label>
                  <select
                    value={tempCategory}
                    onChange={(e) => setTempCategory(e.target.value)}
                    className="w-full text-lg font-semibold bg-white border-2 border-indigo-400 rounded-lg p-3 focus:outline-none mt-1"
                  >
                    <option value="">Select a category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingManually(false)}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold py-2 px-4 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!tempAmount || parseFloat(tempAmount) <= 0) {
                        setError('Please enter a valid amount');
                        return;
                      }
                      if (!tempCategory) {
                        setError('Please select a category');
                        return;
                      }
                      updateCurrentResult({
                        total_amount: parseFloat(tempAmount),
                        category: tempCategory,
                      });
                      setEditingManually(false);
                      setError('');
                    }}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              // NORMAL DISPLAY MODE
              <div className="space-y-6">
                {/* Merchant */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Store/Merchant</p>
                  <p className="text-xl font-bold text-gray-900">{currentResult.merchant}</p>
                </div>

                {/* Amount */}
                <div
                  onClick={() => {
                    setTempAmount(currentResult.total_amount.toString());
                    setEditingAmount(true);
                  }}
                  className="bg-blue-50 rounded-lg p-6 border-2 border-blue-200 cursor-pointer hover:border-blue-400 transition"
                >
                  <p className="text-sm text-gray-600 mb-2">Amount</p>
                  <p className="text-5xl font-bold text-indigo-600">
                    ${currentResult.total_amount.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">Click to edit</p>
                </div>

                {editingAmount && (
                  <div className="bg-blue-50 rounded-lg p-6 border-2 border-blue-400 space-y-3">
                    <p className="text-sm text-gray-600">Enter amount:</p>
                    <input
                      type="number"
                      value={tempAmount}
                      onChange={(e) => setTempAmount(e.target.value)}
                      step="0.01"
                      autoFocus
                      className="w-full text-4xl font-bold text-indigo-600 bg-white border-2 border-indigo-400 rounded-lg p-3 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingAmount(false)}
                        className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold py-2 px-4 rounded-lg transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (!tempAmount || parseFloat(tempAmount) <= 0) {
                            setError('Please enter a valid amount');
                            return;
                          }
                          updateCurrentResult({ total_amount: parseFloat(tempAmount) });
                          setEditingAmount(false);
                          setError('');
                        }}
                        className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                )}

                {/* Category */}
                {!editingCategory ? (
                  <div
                    onClick={() => {
                      setTempCategory(currentResult.category);
                      setEditingCategory(true);
                    }}
                    className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200 cursor-pointer hover:border-purple-400 transition"
                  >
                    <p className="text-sm text-gray-600 mb-1">Category</p>
                    <p className="text-lg font-bold text-purple-700">
                      {currentResult.category || 'Click to select category'}
                    </p>
                  </div>
                ) : (
                  <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-400 space-y-3">
                    <p className="text-sm text-gray-600 font-semibold mb-3">Select category:</p>
                    <div className="max-h-80 overflow-y-auto space-y-2">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => {
                            updateCurrentResult({ category: cat });
                            setEditingCategory(false);
                          }}
                          className={`w-full text-left px-4 py-3 rounded-lg transition font-medium ${
                            currentResult.category === cat
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-gray-900 border border-gray-200 hover:border-purple-400'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setEditingCategory(false)}
                      className="w-full bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold py-2 px-4 rounded-lg transition"
                    >
                      Done
                    </button>
                  </div>
                )}

                {error && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleIncorrect}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-4 px-6 rounded-xl transition text-lg"
                  >
                    <X size={24} className="mx-auto mb-1" />
                    Incorrect
                  </button>
                  <button
                    onClick={handleCorrect}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl transition text-lg"
                  >
                    <Check size={24} className="mx-auto mb-1" />
                    Correct
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===== SAVING STEP =====
  if (step === 'saving') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center space-y-6">
            <Loader size={64} className="text-indigo-500 animate-spin mx-auto" />
            <p className="text-lg text-gray-700 font-semibold">Saving to spreadsheet...</p>
          </div>
        </div>
      </div>
    );
  }

  // ===== SUCCESS STEP =====
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center space-y-6">
            <div className="bg-green-100 rounded-full w-24 h-24 flex items-center justify-center mx-auto">
              <Check size={64} className="text-green-600" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">All Done!</h2>
              <p className="text-lg text-gray-600">
                {processingResults.filter((r) => r.status === 'pending' && r.category).length}{' '}
                expenses saved
              </p>
            </div>
            <p className="text-sm text-gray-500">Ready for more receipts...</p>
          </div>
        </div>
      </div>
    );
  }
}
