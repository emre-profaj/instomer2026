import React, { useState, useEffect } from 'react';
import { conversationAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Trash2, User } from 'lucide-react';
import './InternalNotes.css';

const InternalNotes = ({ conversationId }) => {
    const { currentWorkspace, user: currentUser } = useAuth();
    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (conversationId && currentWorkspace) {
            loadNotes();
        }
    }, [conversationId, currentWorkspace]);

    const loadNotes = async () => {
        try {
            setLoading(true);
            const response = await conversationAPI.getNotes(currentWorkspace.id, conversationId);
            setNotes(response.data.notes);
        } catch (error) {
            console.error('Error loading internal notes:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!newNote.trim()) return;

        try {
            setSending(true);
            // Simple mention detection
            const mentions = newNote.match(/@\w+/g) || [];

            const response = await conversationAPI.addNote(currentWorkspace.id, conversationId, {
                content: newNote,
                mentionedUsers: mentions
            });

            setNotes([response.data.note, ...notes]);
            setNewNote('');
        } catch (error) {
            console.error('Error adding note:', error);
        } finally {
            setSending(false);
        }
    };

    const handleDeleteNote = async (noteId) => {
        if (!window.confirm('Bu notu silmek istediğinize emin misiniz?')) return;

        try {
            await conversationAPI.deleteNote(currentWorkspace.id, conversationId, noteId);
            setNotes(notes.filter(n => n.id !== noteId));
        } catch (error) {
            console.error('Error deleting note:', error);
        }
    };

    if (loading) return <div className="notes-loading">Notlar yükleniyor...</div>;

    return (
        <div className="internal-notes-container">
            <div className="notes-list">
                {notes.length === 0 ? (
                    <div className="empty-notes">Henüz not eklenmemiş.</div>
                ) : (
                    notes.map(note => (
                        <div key={note.id} className="note-card">
                            <div className="note-header">
                                <div className="note-author">
                                    {note.user.avatar ? (
                                        <img src={note.user.avatar} alt={note.user.name} className="author-avatar" />
                                    ) : (
                                        <div className="author-initial">{note.user.name.charAt(0)}</div>
                                    )}
                                    <span className="author-name">{note.user.name}</span>
                                </div>
                                <span className="note-time">
                                    {new Date(note.createdAt).toLocaleString('tr-TR')}
                                </span>
                            </div>
                            <div className="note-content">
                                {note.content.split(' ').map((word, i) =>
                                    word.startsWith('@') ? <span key={i} className="mention">{word} </span> : word + ' '
                                )}
                            </div>
                            {(currentUser.id === note.userId || currentUser.role === 'SUPER_ADMIN') && (
                                <button
                                    className="delete-note-btn"
                                    onClick={() => handleDeleteNote(note.id)}
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>

            <form onSubmit={handleAddNote} className="note-input-container">
                <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Dahili bir not ekle... (@kullanıcı)"
                    className="note-textarea"
                />
                <button type="submit" className="add-note-btn" disabled={sending}>
                    {sending ? 'Ekleniyor...' : 'Not Ekle'}
                </button>
            </form>
        </div>
    );
};

export default InternalNotes;
