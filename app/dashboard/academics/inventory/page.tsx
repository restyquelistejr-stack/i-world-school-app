'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface InventoryBook {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_quantity: number;
  available_quantity: number;
  reorder_quantity: number;
  supplier: string;
  publisher: string;
  delivery_lead_days: number;
  image_url: string;
  location: string;
  notes: string;
  created_at: string;
  linked_courses?: { id: string; name: string }[];
}

interface Course {
  id: string;
  name: string;
}

interface CheckoutRecord {
  id: string;
  student_id: string;
  checked_out_at: string;
  returned_at: string | null;
  student: {
    full_name: string;
  };
}

export default function InventoryPage() {
  const [books, setBooks] = useState<InventoryBook[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Checkout History Modal State
  const [showCheckoutHistoryModal, setShowCheckoutHistoryModal] = useState(false);
  const [checkoutHistory, setCheckoutHistory] = useState<CheckoutRecord[]>([]);
  const [historyBookTitle, setHistoryBookTitle] = useState('');
  const [historyBookId, setHistoryBookId] = useState('');
  
  // Modal States
  const [showForm, setShowForm] = useState(false);
  const [editingBook, setEditingBook] = useState<InventoryBook | null>(null);
  
  // Link Book to Course State
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingBookId, setLinkingBookId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');

  // Checkout State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutBookId, setCheckoutBookId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  // Form data
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    isbn: '',
    total_quantity: 1,
    reorder_quantity: 0,
    supplier: '',
    publisher: '',
    delivery_lead_days: 0,
    image_url: '',
    location: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    
    const [booksRes, coursesRes, studentsRes] = await Promise.all([
      supabase.from('inventory_books').select('*').order('title'),
      supabase.from('courses').select('id, name').eq('is_active', true).order('name'),
      supabase.from('users').select('id, full_name').eq('role', 'student').eq('is_active', true).order('full_name')
    ]);
    
    const fetchedBooks = booksRes.data || [];
    const fetchedCourses = coursesRes.data || [];
    
    if (!booksRes.error) setBooks(fetchedBooks);
    if (!coursesRes.error) setCourses(fetchedCourses);
    if (!studentsRes.error) setStudents(studentsRes.data || []);
    
    // Enrich books with their linked courses
    if (fetchedBooks.length > 0) {
      const bookIds = fetchedBooks.map(b => b.id);
      const { data: linksData, error: linksError } = await supabase
        .from('course_resources')
        .select('book_id, course_id')
        .in('book_id', bookIds);
      
      if (!linksError && linksData) {
        const courseMap = new Map(fetchedCourses.map(c => [c.id, c.name]));
        
        const enrichedBooks = fetchedBooks.map(book => {
          const linkedCourseIds = linksData
            .filter(link => link.book_id === book.id)
            .map(link => link.course_id);
            
          return {
            ...book,
            linked_courses: linkedCourseIds
              .map(id => ({ id, name: courseMap.get(id) || 'Unknown' }))
          };
        });
        setBooks(enrichedBooks);
      }
    }
    
    setLoading(false);
  }

  // --- CRUD FUNCTIONS ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingBook) {
      const { error } = await supabase
        .from('inventory_books')
        .update({
          title: formData.title,
          author: formData.author,
          isbn: formData.isbn,
          total_quantity: formData.total_quantity,
          reorder_quantity: formData.reorder_quantity,
          supplier: formData.supplier,
          publisher: formData.publisher,
          delivery_lead_days: formData.delivery_lead_days,
          image_url: formData.image_url,
          location: formData.location,
          notes: formData.notes
        })
        .eq('id', editingBook.id);
      if (error) alert('Error updating: ' + error.message);
    } else {
      const { error } = await supabase
        .from('inventory_books')
        .insert({ ...formData, available_quantity: formData.total_quantity });
      if (error) alert('Error adding: ' + error.message);
    }
    closeModals();
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm('Permanently delete this book from inventory?')) return;
    const { error } = await supabase.from('inventory_books').delete().eq('id', id);
    if (!error) loadData();
    else alert('Error deleting: ' + error.message);
  }

  async function handleLinkToCourse() {
    if (!linkingBookId || !selectedCourseId) return;
    const { error } = await supabase
      .from('course_resources')
      .insert({ course_id: selectedCourseId, book_id: linkingBookId });
    if (error) alert('Error linking book to course: ' + error.message);
    else {
      alert('✅ Book linked successfully!');
      closeModals();
      loadData();
    }
  }

  async function handleUnlinkCourse(bookId: string, courseId: string) {
    if (!confirm('Remove this book from this course?')) return;
    const { error } = await supabase
      .from('course_resources')
      .delete()
      .eq('book_id', bookId)
      .eq('course_id', courseId);
    if (!error) loadData();
    else alert('Error unlinking: ' + error.message);
  }

  async function handleCheckout() {
    if (!checkoutBookId || !selectedStudentId) return;
    const book = books.find(b => b.id === checkoutBookId);
    if (!book || book.available_quantity <= 0) {
      alert('No copies available for checkout.');
      return;
    }

    const { error: updateError } = await supabase
      .from('inventory_books')
      .update({ available_quantity: book.available_quantity - 1 })
      .eq('id', checkoutBookId);

    if (updateError) { alert('Update error: ' + updateError.message); return; }

    const { error: logError } = await supabase
      .from('book_checkouts')
      .insert({ book_id: checkoutBookId, student_id: selectedStudentId });

    if (logError) alert('Log error: ' + logError.message);
    else alert('✅ Book checked out successfully!');
    closeModals();
    loadData();
  }

  // --- CHECKOUT HISTORY FUNCTIONS ---
  async function openCheckoutHistory(bookId: string, bookTitle: string) {
    setHistoryBookId(bookId);
    setHistoryBookTitle(bookTitle);
    setShowCheckoutHistoryModal(true);
    
    const { data, error } = await supabase
      .from('book_checkouts')
      .select('id, student_id, checked_out_at, returned_at, student:student_id ( full_name )')
      .eq('book_id', bookId)
      .order('checked_out_at', { ascending: false });
      
    if (!error) setCheckoutHistory(data || []);
    else alert('Error loading history: ' + error.message);
  }

  async function handleReturnBook(checkoutId: string) {
    if (!confirm('Return this book?')) return;
    
    // 1. Find the book to increase quantity
    const book = books.find(b => b.id === historyBookId);
    if (!book) return;

    // 2. Update available quantity
    const { error: updateError } = await supabase
      .from('inventory_books')
      .update({ available_quantity: book.available_quantity + 1 })
      .eq('id', historyBookId);

    if (updateError) { alert('Error updating stock: ' + updateError.message); return; }

    // 3. Mark the checkout as returned
    const { error: logError } = await supabase
      .from('book_checkouts')
      .update({ returned_at: new Date().toISOString() })
      .eq('id', checkoutId);

    if (logError) alert('Error logging return: ' + logError.message);
    else {
      alert('✅ Book returned successfully!');
      // Refresh history and main list
      openCheckoutHistory(historyBookId, historyBookTitle);
      loadData();
    }
  }

  // --- UI HELPERS ---
  function openEdit(book: InventoryBook) {
    setEditingBook(book);
    setFormData({
      title: book.title,
      author: book.author || '',
      isbn: book.isbn || '',
      total_quantity: book.total_quantity,
      reorder_quantity: book.reorder_quantity || 0,
      supplier: book.supplier || '',
      publisher: book.publisher || '',
      delivery_lead_days: book.delivery_lead_days || 0,
      image_url: book.image_url || '',
      location: book.location || '',
      notes: book.notes || ''
    });
    setShowForm(true);
  }

  function closeModals() {
    setShowForm(false);
    setEditingBook(null);
    setShowLinkModal(false);
    setLinkingBookId(null);
    setSelectedCourseId('');
    setShowCheckoutModal(false);
    setCheckoutBookId(null);
    setSelectedStudentId('');
    setShowCheckoutHistoryModal(false);
    setCheckoutHistory([]);
  }

  if (loading) return <div className="p-6 flex items-center justify-center h-64">Loading inventory...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📚 Book Inventory</h1>
          <p className="text-sm text-gray-500">Manage course materials, suppliers, and reordering</p>
        </div>
        <button onClick={() => { setEditingBook(null); setFormData({ title: '', author: '', isbn: '', total_quantity: 1, reorder_quantity: 0, supplier: '', publisher: '', delivery_lead_days: 0, image_url: '', location: '', notes: '' }); setShowForm(true); }} 
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
          + Add New Book
        </button>
      </div>

      {/* Book List Grid */}
      {books.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center border border-gray-200">
          <p className="text-gray-500 text-lg">No books in inventory yet.</p>
          <p className="text-sm text-gray-400 mt-2">Click "Add New Book" to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map((book) => {
            const needsReorder = book.available_quantity <= book.reorder_quantity;
            const hasCourses = book.linked_courses && book.linked_courses.length > 0;
            
            return (
              <div key={book.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition relative group flex flex-col">
                
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    {book.image_url && (
                      <img src={book.image_url} alt={book.title} className="w-12 h-12 rounded object-cover border border-gray-200" />
                    )}
                    {!book.image_url && (
                      <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xl">📖</div>
                    )}
                    <div>
                      <h3 className="font-bold text-gray-800 leading-tight">{book.title}</h3>
                      <p className="text-sm text-gray-600">{book.author || 'Unknown Author'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => openEdit(book)} className="text-gray-400 hover:text-blue-600 transition text-xs p-1">✏️</button>
                    <button onClick={() => handleDelete(book.id)} className="text-gray-400 hover:text-red-500 transition text-xs p-1">🗑️</button>
                  </div>
                </div>

                {book.isbn && <p className="text-xs text-gray-400 mt-1">ISBN: {book.isbn}</p>}
                
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-500">
                  {book.publisher && <span>📚 {book.publisher}</span>}
                  {book.supplier && <span>📦 {book.supplier}</span>}
                  {book.delivery_lead_days > 0 && <span>⏱️ {book.delivery_lead_days} days lead</span>}
                </div>

                {/* Linked Courses Section */}
                {hasCourses && (
                  <div className="mt-2 pb-2 border-b border-gray-100">
                    <p className="text-[10px] font-medium text-gray-500 mb-1">Linked to:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {book.linked_courses!.map((course) => (
                        <span key={course.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] rounded-full border border-indigo-200">
                          📖 {course.name}
                          <button 
                            onClick={() => handleUnlinkCourse(book.id, course.id)}
                            className="hover:text-red-600 transition ml-0.5"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full ${book.available_quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {book.available_quantity} Available
                      </span>
                      <span className="text-gray-400">/ {book.total_quantity}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[10px]">
                      <span className="text-gray-400">Reorder at:</span>
                      <span className="font-medium text-gray-600">{book.reorder_quantity}</span>
                      {needsReorder && <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[8px] font-bold">⚠️ LOW</span>}
                    </div>
                  </div>
                  {book.location && <span className="text-xs text-gray-400">📍 {book.location}</span>}
                </div>
                {book.notes && <p className="text-xs text-gray-400 mt-2 italic border-t border-gray-100 pt-2">"{book.notes}"</p>}

                {/* Action Buttons */}
                <div className="mt-3 pt-2 border-t border-gray-100 flex flex-wrap gap-2">
                  {/* View Checkouts Button - NEW */}
                  <button 
                    onClick={() => openCheckoutHistory(book.id, book.title)}
                    className="px-2 py-1 text-[10px] font-medium bg-gray-50 text-gray-600 rounded hover:bg-gray-100 border border-gray-200 transition"
                  >
                    👁️ Checkouts
                  </button>
                  
                  <button onClick={() => { setLinkingBookId(book.id); setShowLinkModal(true); }} className="px-2 py-1 text-[10px] font-medium bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition">
                    🔗 Link to Course
                  </button>
                  <button onClick={() => { setCheckoutBookId(book.id); setShowCheckoutModal(true); }} disabled={book.available_quantity === 0} className="px-2 py-1 text-[10px] font-medium bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition disabled:opacity-50">
                    📤 Checkout
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- MODALS --- */}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h2 className="text-lg font-bold mb-4">{editingBook ? 'Edit Book' : 'Add New Book'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Title *</label>
                  <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Author</label>
                  <input type="text" value={formData.author} onChange={e => setFormData({...formData, author: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">ISBN</label>
                  <input type="text" value={formData.isbn} onChange={e => setFormData({...formData, isbn: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Image URL</label>
                  <input type="text" value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} className="w-full border rounded-lg p-2 text-sm" placeholder="https://..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Publisher</label>
                  <input type="text" value={formData.publisher} onChange={e => setFormData({...formData, publisher: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Supplier</label>
                  <input type="text" value={formData.supplier} onChange={e => setFormData({...formData, supplier: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Delivery Lead (Days)</label>
                  <input type="number" min="0" value={formData.delivery_lead_days.toString()} onChange={e => setFormData({...formData, delivery_lead_days: parseInt(e.target.value) || 0})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Location</label>
                  <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Total Quantity *</label>
                  <input type="number" min="1" required value={formData.total_quantity.toString()} onChange={e => setFormData({...formData, total_quantity: parseInt(e.target.value) || 1})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Reorder Threshold</label>
                  <input type="number" min="0" value={formData.reorder_quantity.toString()} onChange={e => setFormData({...formData, reorder_quantity: parseInt(e.target.value) || 0})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Notes</label>
                <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border rounded-lg p-2 text-sm" rows={2} />
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                <button type="button" onClick={closeModals} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingBook ? 'Update' : 'Add'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Link to Course Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold mb-4">🔗 Link Book to Course</h2>
            <p className="text-sm text-gray-600 mb-4">Which course uses this book?</p>
            <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} className="w-full border rounded-lg p-2 text-sm mb-4">
              <option value="">Select a Course...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={closeModals} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Cancel</button>
              <button onClick={handleLinkToCourse} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Link</button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout to Student Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold mb-4">📤 Checkout Book</h2>
            <p className="text-sm text-gray-600 mb-4">Which student is borrowing this book?</p>
            <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} className="w-full border rounded-lg p-2 text-sm mb-4">
              <option value="">Select a Student...</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={closeModals} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Cancel</button>
              <button onClick={handleCheckout} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Checkout</button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout History Modal - NEW */}
      {showCheckoutHistoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold">📋 Checkout History</h2>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Book: <span className="font-medium text-gray-800">{historyBookTitle}</span></p>
            
            {checkoutHistory.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No checkout history for this book.</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {checkoutHistory.map((record) => {
                  const isOut = !record.returned_at;
                  return (
                    <div key={record.id} className={`flex items-center justify-between p-3 rounded-lg border ${isOut ? 'border-blue-200 bg-blue-50/50' : 'border-gray-100 bg-gray-50'}`}>
                      <div>
                        <div className="font-medium text-gray-800">{record.student.full_name}</div>
                        <div className="text-xs text-gray-500">
                          Checked out: {new Date(record.checked_out_at).toLocaleDateString()}
                          {record.returned_at && (
                            <span className="ml-2 text-green-600">• Returned: {new Date(record.returned_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      {isOut && (
                        <button 
                          onClick={() => handleReturnBook(record.id)}
                          className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition"
                        >
                          Return
                        </button>
                      )}
                      {!isOut && (
                        <span className="text-xs text-gray-400 italic">Returned</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex justify-end pt-3 border-t border-gray-100">
              <button onClick={closeModals} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}