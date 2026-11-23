// src/Albums.tsx  — dashboard beheerpagina voor fotoalbums
import React, { useState, useEffect } from 'react';
import { safeHref, safeImageUrl } from './utils/safeUrl';

interface AlbumsProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

function getCurrentUser() {
  try {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

interface Album {
  id: number;
  title: string;
  description: string;
  url: string;
  coverImage: string;
  year: string;
  category: string;
}

const CATEGORIES = ['Vergadering', 'Gewestweekend', 'IKAA', 'Fuif', 'Eetfestijn', 'Activiteit', 'Cocktailquiz', 'Overig'];
const CURRENT_YEAR = String(new Date().getFullYear());

const emptyAlbum = { title: '', description: '', url: '', coverImage: '', year: CURRENT_YEAR, category: 'Overig' };

// Converteert en comprimeert elke geüploade foto automatisch naar een lichtgewicht WebP in de browser
async function compressImageToWebP(file: File): Promise<{ dataUrl: string; sizeKb: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 750;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context mislukt'));

        ctx.drawImage(img, 0, 0, width, height);

        // Converteer naar WebP met 82% kwaliteit (zeer scherp, extreem klein ~30-60 KB)
        const webpDataUrl = canvas.toDataURL('image/webp', 0.82);
        const sizeKb = Math.round((webpDataUrl.length * 3) / 4 / 1024);
        resolve({ dataUrl: webpDataUrl, sizeKb });
      };
      img.onerror = () => reject(new Error('Kon afbeelding niet decoderen'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Fout bij lezen bestand'));
    reader.readAsDataURL(file);
  });
}

export default function Albums({ authFetch }: AlbumsProps) {
  const currentUser = getCurrentUser();
  const hasRole = (role: string) => {
    if (!currentUser) return false;
    const roles: string[] = Array.isArray(currentUser.roles) ? currentUser.roles : [currentUser.role || ''];
    const lowerRoles = roles.map((r: string) => String(r).toLowerCase().trim());
    if (lowerRoles.includes('admin') || lowerRoles.includes('groepsleiding')) return true;
    return lowerRoles.includes(role.toLowerCase().trim());
  };
  const canManage = hasRole('media') || hasRole('website') || hasRole('admin');

  const [albums, setAlbums] = useState<Album[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyAlbum });
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [coverMode, setCoverMode] = useState<'upload' | 'url'>('upload');
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      setPreviewError(false);
      const { dataUrl, sizeKb } = await compressImageToWebP(file);
      setForm(prev => ({ ...prev, coverImage: dataUrl }));
      setCompressedSize(sizeKb);
    } catch (err: any) {
      console.error(err);
      alert('Kon afbeelding niet omzetten naar WebP: ' + (err?.message || 'Onbekende fout'));
    } finally {
      setIsCompressing(false);
    }
  };

  const fetchAlbums = async () => {
    try {
      const res = await fetch('/api/albums');
      setAlbums(await res.json());
    } catch (e) { console.error('Error fetching albums', e); }
  };

  useEffect(() => { fetchAlbums(); }, []);

  const openAdd = () => {
    setForm({ ...emptyAlbum });
    setEditId(null);
    setPreviewError(false);
    setCoverMode('upload');
    setCompressedSize(null);
    setShowModal(true);
  };

  const openEdit = (album: Album) => {
    setForm({
      title: album.title,
      description: album.description || '',
      url: album.url,
      coverImage: album.coverImage || '',
      year: album.year || CURRENT_YEAR,
      category: album.category || 'Overig',
    });
    setEditId(album.id);
    setPreviewError(false);
    if (album.coverImage && !album.coverImage.startsWith('data:')) {
      setCoverMode('url');
      setCompressedSize(null);
    } else {
      setCoverMode('upload');
      setCompressedSize(album.coverImage ? Math.round((album.coverImage.length * 3) / 4 / 1024) : null);
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await authFetch(`/api/albums/${editId}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await authFetch('/api/albums', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowModal(false);
      fetchAlbums();
    } catch (err) { alert('Fout bij opslaan album.'); }
  };

  const confirmDelete = async () => {
    if (itemToDelete == null) return;
    try {
      await authFetch(`/api/albums/${itemToDelete}`, { method: 'DELETE' });
      setItemToDelete(null);
      fetchAlbums();
    } catch (err) { alert('Fout bij verwijderen.'); }
  };

  const inputClass = "w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">Fotoalbums</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Beheer de links naar fotoalbums op de publieke website.{' '}
            <a href="/fotos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              Bekijk pagina <span className="material-symbols-outlined text-sm">open_in_new</span>
            </a>
          </p>
        </div>
        {canManage && (
          <button onClick={openAdd}
            className="px-4 py-2 bg-primary text-white font-bold rounded-lg shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-2 cursor-pointer shrink-0">
            <span className="material-symbols-outlined text-sm">add_photo_alternate</span> Nieuw Album
          </button>
        )}
      </div>

      {/* Grid van albums */}
      {albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-center">
          <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-4">photo_library</span>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">Nog geen albums</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Klik op "Nieuw Album" om er een toe te voegen.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {albums.map(album => (
            <div key={album.id} className="group bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
              {/* Cover */}
              <div className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-700 overflow-hidden">
                {safeImageUrl(album.coverImage) ? (
                  <img src={safeImageUrl(album.coverImage)} alt={album.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent-blue/10">
                    <span className="material-symbols-outlined text-4xl text-primary/30">photo_library</span>
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <span className="px-2 py-0.5 bg-black/40 backdrop-blur-sm text-white text-xs font-bold rounded-full">
                    {album.category}
                  </span>
                </div>
                <div className="absolute top-2 right-2">
                  <span className="px-2 py-0.5 bg-black/40 backdrop-blur-sm text-white text-xs font-bold rounded-full">
                    {album.year}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-slate-800 dark:text-white leading-tight mb-1">{album.title}</h3>
                {album.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{album.description}</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
                  {safeHref(album.url) ? (
                    <a href={safeHref(album.url)} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                      Bekijk album
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">Ongeldige link</span>
                  )}
                  {canManage && (
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(album)}
                        className="size-9 text-slate-400 hover:text-primary bg-slate-50 dark:bg-slate-700 hover:bg-orange-50 dark:hover:bg-primary/10 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer">
                        <span className="material-symbols-outlined text-[20px] leading-none">edit</span>
                      </button>
                      <button onClick={() => setItemToDelete(album.id)}
                        className="size-9 text-slate-400 hover:text-red-600 bg-slate-50 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer">
                        <span className="material-symbols-outlined text-[20px] leading-none">delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                {editId ? 'Album Bewerken' : 'Nieuw Album Toevoegen'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Titel *</label>
                <input required type="text" value={form.title}
                  onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="bv. Gewestweekend Ardennen" className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Link naar album *</label>
                <input required type="url" value={form.url}
                  onChange={e => setForm({...form, url: e.target.value})}
                  placeholder="https://photos.google.com/..." className={inputClass} />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Google Photos, Flickr, Dropbox, … elke publieke link werkt.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Jaar</label>
                  <input type="text" value={form.year}
                    onChange={e => setForm({...form, year: e.target.value})}
                    placeholder="2025" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Categorie</label>
                  <select value={form.category}
                    onChange={e => setForm({...form, category: e.target.value})}
                    className={inputClass}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Korte beschrijving</label>
                <textarea value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="Optionele omschrijving van het album..."
                  rows={2} className={`${inputClass} resize-none`} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Cover afbeelding
                  </label>
                  <div className="flex bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setCoverMode('upload')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${coverMode === 'upload' ? 'bg-white dark:bg-slate-600 text-primary shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
                      Bestand uploaden
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoverMode('url')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${coverMode === 'url' ? 'bg-white dark:bg-slate-600 text-primary shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
                      URL link
                    </button>
                  </div>
                </div>

                {coverMode === 'upload' ? (
                  <div>
                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl hover:border-primary/50 bg-slate-50 dark:bg-slate-800/50 cursor-pointer transition-colors text-center group">
                      <span className="material-symbols-outlined text-3xl text-slate-400 group-hover:text-primary transition-colors mb-1">
                        add_photo_alternate
                      </span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {isCompressing ? 'Afbeelding comprimeren naar WebP...' : 'Kies een foto van je computer of gsm'}
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        Wordt automatisch geoptimaliseerd naar WebP (&lt;60 KB) om server bandbreedte te sparen
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        disabled={isCompressing}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <div>
                    <input
                      type="url"
                      value={form.coverImage.startsWith('data:') ? '' : form.coverImage}
                      onChange={e => {
                        setForm({ ...form, coverImage: e.target.value });
                        setPreviewError(false);
                        setCompressedSize(null);
                      }}
                      placeholder="https://..."
                      className={inputClass}
                    />
                    <p className="text-xs text-slate-400 mt-1">Plak een rechtstreekse afbeeldingslink (bv. Google Photos of Unsplash).</p>
                  </div>
                )}

                {/* Live preview */}
                {form.coverImage && !previewError && (
                  <div className="mt-3 relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 aspect-[4/3] bg-slate-100 dark:bg-slate-700">
                    <img
                      src={form.coverImage}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={() => setPreviewError(true)}
                    />
                    {compressedSize && (
                      <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-emerald-600/90 backdrop-blur-xs text-white text-xs font-bold rounded-full flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        Geoptimaliseerd WebP ({compressedSize} KB)
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setForm({ ...form, coverImage: '' });
                        setCompressedSize(null);
                      }}
                      className="absolute top-2 right-2 size-7 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                )}
                {previewError && (
                  <p className="text-xs text-red-500 mt-1">⚠️ Afbeelding kon niet geladen worden. Controleer de link of kies een ander bestand.</p>
                )}
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg">
                  Annuleren
                </button>
                <button type="submit"
                  className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90">
                  {editId ? 'Opslaan' : 'Toevoegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete bevestiging */}
      {itemToDelete != null && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Album verwijderen?</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6">Het album verdwijnt van de publieke website.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setItemToDelete(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                Annuleren
              </button>
              <button onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors">
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}