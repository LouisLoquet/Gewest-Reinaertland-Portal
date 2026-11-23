import React, { useState, useEffect, useMemo } from 'react';
import { safeImageUrl } from '../utils/safeUrl';

export const AVAILABLE_ROLES = [
  { id: 'admin', label: 'Admin', color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800', icon: 'shield_person' },
  { id: 'groepsleiding', label: 'Groepsleiding', color: 'bg-orange-50 text-primary border-orange-200 dark:bg-primary/20 dark:text-orange-300 dark:border-primary/30', icon: 'crown' },
  { id: 'media', label: 'Media', color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800', icon: 'photo_camera' },
  { id: 'som', label: 'SOM', color: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800', icon: 'volunteer_activism' },
  { id: 'veegee', label: 'VEEGEE', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800', icon: 'groups' },
  { id: 'twizzit', label: 'Twizzit', color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800', icon: 'badge' },
  { id: 'website', label: 'Website', color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800', icon: 'code' },
  { id: 'penningmeester', label: 'Penningmeester', color: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800', icon: 'account_balance_wallet' },
  { id: 'leiding', label: 'Leiding', color: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', icon: 'person' },
];

export const CHIRO_GROEPEN = [
  'Sint-Agnes, Stekene',
  'Sint-Andreas, Stekene',
  'Alleman, Sinaai',
  'Wij, Sinaai',
  'Hermelinde, Kemzeke',
  'Juventa, Kemzeke',
  'Saleghem, Meerdonk',
  'Judocus, Verrebroek',
  'Inter-Jeugdig, De Klinge'
];

export interface UnifiedUser {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  roles: string[];
  phone?: string;
  chiroGroup?: string;
  hasLogin?: boolean;
  mustChangePassword?: boolean;
}

interface LeidingBeheerProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export default function LeidingBeheer({ authFetch }: LeidingBeheerProps) {
  const [users, setUsers] = useState<UnifiedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedLoginStatus, setSelectedLoginStatus] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Current user permissions
  const stored = localStorage.getItem('user');
  let currentUser: any = null;
  try { currentUser = stored ? JSON.parse(stored) : null; } catch {}

  const currentRoles: string[] = Array.isArray(currentUser?.roles)
    ? currentUser.roles
    : [currentUser?.role || ''];
  const lowerRoles = currentRoles.map(r => String(r).toLowerCase().trim());
  const canManage = lowerRoles.includes('admin') || lowerRoles.includes('groepsleiding') || lowerRoles.includes('website');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UnifiedUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<UnifiedUser | null>(null);
  const [adminTransferTarget, setAdminTransferTarget] = useState<UnifiedUser | null>(null);
  const [isTransferringAdmin, setIsTransferringAdmin] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    chiroGroup: string;
    roles: string[];
    hasLogin: boolean;
    password?: string;
    mustChangePassword?: boolean;
  }>({
    name: '',
    email: '',
    phone: '',
    chiroGroup: '',
    roles: ['leiding'],
    hasLogin: true,
    password: '',
    mustChangePassword: true,
  });

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importError, setImportError] = useState('');
  const [importResults, setImportResults] = useState<{
    imported: number;
    updated: number;
    errors: string[];
    createdCredentials?: Array<{ name: string; email: string; temporaryPassword: string }>;
  } | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error('Fout bij ophalen gebruikers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
      .filter(u => {
        const q = searchQuery.toLowerCase();
        const matchesQuery = !q ||
          u.name.toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.phone || '').toLowerCase().includes(q) ||
          (u.chiroGroup || '').toLowerCase().includes(q);

        const matchesGroup = !selectedGroup || u.chiroGroup === selectedGroup;

        const uRoles = (u.roles || [u.role]).map(r => r.toLowerCase());
        const matchesRole = !selectedRole || uRoles.includes(selectedRole.toLowerCase());

        let matchesLogin = true;
        if (selectedLoginStatus === 'yes') matchesLogin = u.hasLogin === true;
        if (selectedLoginStatus === 'no') matchesLogin = u.hasLogin === false;

        return matchesQuery && matchesGroup && matchesRole && matchesLogin;
      });
  }, [users, searchQuery, selectedGroup, selectedRole, selectedLoginStatus]);

  // Unieke chirogroepen
  const uniqueGroups = useMemo(() => {
    const fromUsers = users.map(u => u.chiroGroup).filter(Boolean) as string[];
    return Array.from(new Set([...CHIRO_GROEPEN, ...fromUsers])).sort();
  }, [users]);

  // Open Create
  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      chiroGroup: CHIRO_GROEPEN[0],
      roles: ['leiding'],
      hasLogin: true,
      password: '',
      mustChangePassword: true,
    });
    setFormError('');
    setShowModal(true);
  };

  // Open Edit
  const handleOpenEdit = (user: UnifiedUser) => {
    setEditingUser(user);
    const uRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role || 'leiding'];
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      chiroGroup: user.chiroGroup || CHIRO_GROEPEN[0],
      roles: uRoles,
      hasLogin: user.hasLogin !== false,
      password: '',
      mustChangePassword: user.mustChangePassword === true,
    });
    setFormError('');
    setShowModal(true);
  };

  // Toggle role in form
  const toggleRole = (roleId: string) => {
    if (formData.roles.includes(roleId)) {
      if (formData.roles.length === 1) return; // minstens 1 rol
      setFormData({ ...formData, roles: formData.roles.filter(r => r !== roleId) });
    } else {
      if (roleId === 'admin') {
        const ok = window.confirm(
          `Opgelet: De Admin-rol kan maar aan 1 persoon tegelijk gekoppeld zijn. Als je Admin toewijst aan ${formData.name || 'dit lid'}, wordt de rol bij de huidige beheerder weggehaald. Wil je doorgaan?`
        );
        if (!ok) return;
      }
      setFormData({ ...formData, roles: [...formData.roles, roleId] });
    }
  };

  // Transfer admin to another user
  const handleConfirmTransferAdmin = async () => {
    if (!adminTransferTarget) return;
    setIsTransferringAdmin(true);
    try {
      const res = await authFetch('/api/users/transfer-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: adminTransferTarget.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fout bij overdragen Admin.');

      if (currentUser) {
        const updatedRoles = currentRoles.filter(r => r.toLowerCase() !== 'admin');
        const updatedUser = { ...currentUser, role: updatedRoles[0] || 'leiding', roles: updatedRoles };
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }

      setFormSuccess(`Admin-rol is succesvol overgedragen aan ${adminTransferTarget.name}.`);
      setAdminTransferTarget(null);
      setTimeout(() => setFormSuccess(''), 5000);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsTransferringAdmin(false);
    }
  };

  // Save Member/User
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fout bij opslaan.');

      setShowModal(false);
      if (!editingUser && data.temporaryPassword) {
        setFormSuccess(`Lid "${formData.name}" aangemaakt! Eenmalig tijdelijk wachtwoord: ${data.temporaryPassword} (kopieer en geef dit veilig door).`);
        setTimeout(() => setFormSuccess(''), 30000);
      } else {
        setFormSuccess(editingUser ? `Lid "${formData.name}" succesvol bijgewerkt!` : `Lid "${formData.name}" aangemaakt!`);
        setTimeout(() => setFormSuccess(''), 5000);
      }
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  // Delete User
  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    try {
      const res = await authFetch(`/api/users/${userToDelete.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Fout bij verwijderen.');
        return;
      }
      setUserToDelete(null);
      fetchUsers();
    } catch (e) {
      alert('Fout bij verwijderen.');
    }
  };

  // Copy all emails
  const handleCopyEmails = () => {
    const emails = filteredUsers.map(u => u.email).filter(Boolean);
    if (emails.length === 0) return;
    navigator.clipboard.writeText(emails.join(', '));
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 3000);
  };

  // Download Sample Template CSV
  const handleDownloadTemplate = () => {
    const headers = ['Naam', 'E-mailadres', 'Telefoon', 'Chirogroep', 'Rollen', 'Login Toegang'];
    const sample = [
      headers.join(';'),
      'Jan Janssens;jan@reinaertland.be;0470123456;Sint-Agnes, Stekene;Leiding, Media;Ja',
      'Marie Peeters;marie@reinaertland.be;0480987654;Alleman, Sinaai;Penningmeester, Leiding;Ja',
      'Lukas De Smet;lukas@reinaertland.be;0490112233;Hermelinde, Kemzeke;SOM;Nee',
    ].join('\r\n');

    const blob = new Blob(['\uFEFF' + sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sjabloon_gewestleiding.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse CSV file for import preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportError('');
    setImportResults(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length <= 1) {
          setImportError('Het bestand is leeg of bevat alleen koppen.');
          return;
        }

        const delimiter = lines[0].includes(';') ? ';' : ',';
        const rows = lines.slice(1).map(line => {
          const cols = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
          const name = cols[0] || '';
          const email = cols[1] || '';
          const phone = cols[2] || '';
          const chiroGroup = cols[3] || 'Gewestleiding';
          const rawRoles = (cols[4] || 'leiding').split(',').map(r => r.trim().toLowerCase());
          const hasLogin = (cols[5] || 'ja').toLowerCase().startsWith('j');

          return { name, email, phone, chiroGroup, roles: rawRoles, hasLogin };
        }).filter(r => r.name && r.email);

        setImportPreview(rows);
      } catch (err) {
        setImportError('Kan het CSV bestand niet ontleden. Controleer de opmaak.');
      }
    };
    reader.readAsText(file);
  };

  // Submit Import
  const handleExecuteImport = async () => {
    if (importPreview.length === 0) return;
    try {
      const res = await authFetch('/api/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: importPreview })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import mislukt.');
      setImportResults(data);
      fetchUsers();
    } catch (err: any) {
      setImportError(err.message);
    }
  };

  const inputClass = "w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all";

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 font-display">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Leiding & Toegang
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Centraal overzicht van alle gewestleiding, commissierollen en accounttoegang.
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setImportFile(null);
                setImportPreview([]);
                setImportResults(null);
                setImportError('');
                setShowImportModal(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">upload_file</span>
              Importeer
            </button>

            <a
              href="/api/users/export"
              download
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              Exporteer CSV
            </a>

            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-primary text-white font-bold rounded-xl shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-1.5 text-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">person_add</span>
              Nieuw Lid / Account
            </button>
          </div>
        )}
      </div>

      {formSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-2xl text-xs font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-base">check_circle</span>
          {formSuccess}
        </div>
      )}

      {/* Zoekbalk & Filters */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
            <input
              type="text"
              placeholder="Zoek op naam, e-mail, GSM of Chirogroep..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="">Alle Chirogroepen</option>
              {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="">Alle Rollen</option>
              {AVAILABLE_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>

            {canManage && (
              <select
                value={selectedLoginStatus}
                onChange={e => setSelectedLoginStatus(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
              >
                <option value="">Alle Toegang</option>
                <option value="yes">Login actief</option>
                <option value="no">Geen Login</option>
              </select>
            )}

            <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 pl-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-sm ${viewMode === 'grid' ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                title="Rasterweergave"
              >
                <span className="material-symbols-outlined text-sm">grid_view</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-sm ${viewMode === 'table' ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                title="Lijstweergave"
              >
                <span className="material-symbols-outlined text-sm">table_rows</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700/50">
          <span>{filteredUsers.length} leidingleden gevonden</span>
          <button
            onClick={handleCopyEmails}
            className="text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">content_copy</span>
            {copiedNotification ? 'E-mails gekopieerd!' : 'Kopieer alle e-mails'}
          </button>
        </div>
      </div>

      {/* Overzicht van Leiding */}
      {filteredUsers.length === 0 ? (
        <div className="p-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 text-center text-slate-400">
          <span className="material-symbols-outlined text-4xl mb-2">person_off</span>
          <h4 className="font-bold text-slate-700 dark:text-slate-300">Geen leiding gevonden</h4>
          <p className="text-xs text-slate-400 mt-1">Pas je zoekterm of actieve filters aan.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map(user => {
            const uRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role || 'leiding'];

            return (
              <div
                key={user.id}
                className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start gap-3.5 mb-3">
                    <img
                      src={safeImageUrl(user.avatar, `https://placehold.co/150x150/d94824/white?text=${encodeURIComponent((user.name || 'L').charAt(0))}`)}
                      alt={user.name}
                      className="size-12 rounded-2xl object-cover border border-slate-100 dark:border-slate-700 shrink-0"
                    />
                    <div className="overflow-hidden flex-1">
                      <h4 className="font-bold text-slate-900 dark:text-white truncate text-base">
                        {user.name}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {user.chiroGroup || 'Gewest Reinaertland'}
                      </p>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1">
                        {lowerRoles.includes('admin') && user.id !== currentUser?.id && (
                          <button
                            onClick={() => setAdminTransferTarget(user)}
                            className="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                            title={`Draag Admin-rol over aan ${user.name}`}
                          >
                            <span className="material-symbols-outlined text-sm">shield_person</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-1 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 dark:hover:bg-primary/10 transition-colors"
                          title="Bewerken"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                        <button
                          onClick={() => setUserToDelete(user)}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Verwijderen"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Rollen badges */}
                  <div className="flex flex-wrap gap-1.5 my-3">
                    {uRoles.map(roleKey => {
                      const roleConfig = AVAILABLE_ROLES.find(r => r.id === roleKey.toLowerCase()) || {
                        id: roleKey,
                        label: roleKey,
                        color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300',
                        icon: 'label'
                      };
                      return (
                        <span
                          key={roleKey}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${roleConfig.color}`}
                        >
                          <span className="material-symbols-outlined text-[12px]">{roleConfig.icon}</span>
                          {roleConfig.label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 space-y-1.5 text-xs">
                  {user.phone && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span className="material-symbols-outlined text-slate-400 text-sm">phone</span>
                      <a href={`tel:${user.phone}`} className="hover:text-primary transition-colors font-medium">
                        {user.phone}
                      </a>
                    </div>
                  )}
                  {user.email && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span className="material-symbols-outlined text-slate-400 text-sm">mail</span>
                      <a href={`mailto:${user.email}`} className="hover:text-primary transition-colors font-medium truncate">
                        {user.email}
                      </a>
                    </div>
                  )}

                  {canManage && (
                    <div className="pt-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-semibold">Dashboard:</span>
                      <span className={`inline-flex items-center gap-1 font-bold ${
                        user.hasLogin !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      }`}>
                        <span className={`size-1.5 rounded-full ${user.hasLogin !== false ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        {user.hasLogin !== false ? (user.mustChangePassword ? 'Wachtwoord reset nodig' : 'login actief') : 'Geen account'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Tabel weergave */
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-400 uppercase tracking-wider font-bold border-b border-slate-100 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-4">Lid</th>
                  <th className="py-3 px-4">Chirogroep</th>
                  <th className="py-3 px-4">Functies / Rollen</th>
                  <th className="py-3 px-4">Contact</th>
                  {canManage && <th className="py-3 px-4">Inlogstatus</th>}
                  {canManage && <th className="py-3 px-4 text-right">Acties</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredUsers.map(user => {
                  const uRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role || 'leiding'];

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={safeImageUrl(user.avatar, `https://placehold.co/150x150/d94824/white?text=${encodeURIComponent((user.name || 'L').charAt(0))}`)}
                            alt={user.name}
                            className="size-8 rounded-full object-cover shrink-0"
                          />
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">{user.name}</span>
                            <span className="text-slate-400 text-[11px]">{user.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">
                        {user.chiroGroup || 'Gewestleiding'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {uRoles.map(rk => {
                            const rConf = AVAILABLE_ROLES.find(r => r.id === rk.toLowerCase());
                            return (
                              <span key={rk} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${rConf?.color || 'bg-slate-100 text-slate-700'}`}>
                                {rConf?.label || rk}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          {user.phone && <a href={`tel:${user.phone}`} className="hover:text-primary block font-medium">{user.phone}</a>}
                          <a href={`mailto:${user.email}`} className="hover:text-primary text-slate-400 block">{user.email}</a>
                        </div>
                      </td>
                      {canManage && (
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 font-bold ${
                            user.hasLogin !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                          }`}>
                            <span className={`size-1.5 rounded-full ${user.hasLogin !== false ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            {user.hasLogin !== false ? (user.mustChangePassword ? 'Reset nodig' : 'login actief') : 'Geen'}
                          </span>
                        </td>
                      )}
                      {canManage && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {lowerRoles.includes('admin') && user.id !== currentUser?.id && (
                              <button
                                onClick={() => setAdminTransferTarget(user)}
                                className="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                title={`Draag Admin-rol over aan ${user.name}`}
                              >
                                <span className="material-symbols-outlined text-sm">shield_person</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEdit(user)}
                              className="p-1 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 dark:hover:bg-primary/10 transition-colors"
                              title="Bewerken"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                            <button
                              onClick={() => setUserToDelete(user)}
                              className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              title="Verwijderen"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: TOEVOEGEN / BEWERKEN
          ───────────────────────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                {editingUser ? 'Lid & Account Bewerken' : 'Nieuw Lid / Account'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Naam *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="bv. Louis Loquet"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    E-mailadres *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="naam@reinaertland.be"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Telefoon / GSM
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="0470 12 34 56"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Chirogroep
                </label>
                <select
                  value={formData.chiroGroup}
                  onChange={e => setFormData({ ...formData, chiroGroup: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Selecteer Chirogroep...</option>
                  {CHIRO_GROEPEN.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              {/* Multi-role Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Rollen & Verantwoordelijkheden (klik om te selecteren)
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_ROLES.filter(role => role.id !== 'admin' || lowerRoles.includes('admin')).map(role => {
                    const isSelected = formData.roles.includes(role.id);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => toggleRole(role.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? `${role.color} ring-2 ring-primary/40`
                            : 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700 opacity-60'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">{role.icon}</span>
                        {role.label}
                        {isSelected && <span className="material-symbols-outlined text-xs">check</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Inlogtoegang & Wachtwoord */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.hasLogin}
                    onChange={e => setFormData({ ...formData, hasLogin: e.target.checked })}
                    className="size-4 text-primary rounded accent-primary"
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Geef inlogtoegang tot het portaal
                  </span>
                </label>

                {formData.hasLogin && (
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        {editingUser ? 'Wachtwoord opnieuw instellen (optioneel)' : 'Tijdelijk Wachtwoord'}
                      </label>
                      <input
                        type="text"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        placeholder={editingUser ? 'Laat leeg om huidig wachtwoord te behouden' : 'Laat leeg voor automatisch veilig wachtwoord'}
                        className={inputClass}
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.mustChangePassword}
                        onChange={e => setFormData({ ...formData, mustChangePassword: e.target.checked })}
                        className="size-4 text-primary rounded accent-primary"
                      />
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Verplicht wachtwoord wijzigen bij volgende aanmelding
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90 cursor-pointer"
                >
                  {editingUser ? 'Bijwerken' : 'Lid Opslaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: IMPORTEREN
          ───────────────────────────────────────────────────────────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  Meerdere Gebruikers Importeren
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Importeer in één keer alle leidingleden en accounts via een CSV bestand.
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Stap 1: Template */}
              <div className="p-4 bg-orange-50/60 dark:bg-primary/10 rounded-2xl border border-orange-100 dark:border-primary/20 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Stap 1: Download het sjabloon</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Gebruik het standaardsjabloon met de juiste kolommen.</p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-3.5 py-1.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 flex items-center gap-1 shrink-0"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  CSV Sjabloon
                </button>
              </div>

              {/* Stap 2: Bestand Upload */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Stap 2: Kies of sleep je CSV bestand
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
              </div>

              {importError && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold">
                  {importError}
                </div>
              )}

              {/* Stap 3: Preview */}
              {importPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span>Voorvertoning: {importPreview.length} rijen gedetecteerd</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 font-bold sticky top-0">
                        <tr>
                          <th className="p-2">Naam</th>
                          <th className="p-2">E-mail</th>
                          <th className="p-2">Chirogroep</th>
                          <th className="p-2">Rollen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {importPreview.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="p-2 font-bold">{r.name}</td>
                            <td className="p-2 text-slate-500">{r.email}</td>
                            <td className="p-2">{r.chiroGroup}</td>
                            <td className="p-2">{r.roles.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importResults && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs space-y-1">
                  <p className="font-bold text-emerald-800 dark:text-emerald-300">
                    ✅ Import succesvol voltooid!
                  </p>
                  <p className="text-emerald-700 dark:text-emerald-400">
                    Nieuw toegevoegd: {importResults.imported} • Bijgewerkt: {importResults.updated}
                  </p>
                  {importResults.createdCredentials && importResults.createdCredentials.length > 0 && (
                    <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-1">
                      <p className="font-bold text-slate-800 dark:text-white">
                        🔐 Eenmalige tijdelijke wachtwoorden (noteer deze nu!):
                      </p>
                      <div className="max-h-36 overflow-y-auto font-mono text-[11px] space-y-0.5 text-slate-700 dark:text-slate-300">
                        {importResults.createdCredentials.map((c: any, idx: number) => (
                          <div key={idx}>{c.name} ({c.email}): <strong>{c.temporaryPassword}</strong></div>
                        ))}
                      </div>
                    </div>
                  )}
                  {importResults.errors && importResults.errors.length > 0 && (
                    <div className="text-red-600 mt-2">
                      Fouten: {importResults.errors.join('; ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                Sluiten
              </button>
              {importPreview.length > 0 && !importResults && (
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90"
                >
                  Import Uitvoeren ({importPreview.length} leden)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: BEVESTIG VERWIJDEREN
          ───────────────────────────────────────────────────────────────────────────── */}
      {userToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-700 shadow-xl text-center">
            <div className="size-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-2xl">delete</span>
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white text-base mb-1">
              "{userToDelete.name}" Verwijderen?
            </h4>
            <p className="text-xs text-slate-500 mb-5">
              Weet je zeker dat je dit lid en de inlogtoegang wilt wissen? Deze actie kan niet ongedaan worden gemaakt.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Annuleren
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 shadow-sm cursor-pointer"
              >
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: ADMIN OVERDRAGEN BEVESTIGING
          ───────────────────────────────────────────────────────────────────────────── */}
      {adminTransferTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-xl text-center">
            <div className="size-14 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200 dark:border-amber-800">
              <span className="material-symbols-outlined text-3xl">shield_person</span>
            </div>
            <h4 className="font-black text-slate-900 dark:text-white text-lg mb-2">
              Admin-rol overdragen?
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Weet je zeker dat je de rol <strong>Admin</strong> wilt overdragen aan <strong>{adminTransferTarget.name}</strong>?
            </p>
            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300 text-left mb-6 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">info</span>
                Belangrijk:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-400">
                <li>Er kan <strong>maximaal 1 Admin</strong> tegelijk zijn.</li>
                <li>Admin kan alles binnen het systeem beheren.</li>
                <li>Na het overdragen verlies je zelf je Admin-rechten (je behoudt je overige rollen).</li>
              </ul>
            </div>
            <div className="flex gap-2.5 justify-center">
              <button
                type="button"
                onClick={() => setAdminTransferTarget(null)}
                disabled={isTransferringAdmin}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleConfirmTransferAdmin}
                disabled={isTransferringAdmin}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/20 cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">check</span>
                {isTransferringAdmin ? 'Bezig...' : 'Ja, draag Admin-rol over'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
