'use client';

import { useState, useTransition } from 'react';
import type { EmailSourceConfiguration, EmailSourceOptions } from '@tracker/contracts';
import { Save, X } from 'lucide-react';
import { saveEmailSource } from '@/app/integrations/email-actions';
import { EmailFeedback } from '@/components/email-feedback';
import type { EmailActionResult } from '@/lib/email-ui';

export function EmailSourceEditor({
  source,
  options,
  onSaved,
  onClose,
}: {
  source: EmailSourceConfiguration | null;
  options: EmailSourceOptions;
  onSaved: (source: EmailSourceConfiguration) => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<EmailActionResult<unknown>, { ok: false }> | null>(
    null,
  );
  const gmailConnections = options.integrations.filter((item) => item.provider === 'gmail');
  const canSave = gmailConnections.length > 0 && options.adapters.length > 0;
  return (
    <section className="panel email-editor" aria-labelledby="email-editor-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Configuración de fuente</p>
          <h2 id="email-editor-title">
            {source ? 'Editar fuente de correo' : 'Nueva fuente de correo'}
          </h2>
        </div>
        <button className="secondary-button" type="button" onClick={onClose} disabled={pending}>
          <X size={15} aria-hidden="true" />
          Cerrar
        </button>
      </div>
      <EmailFeedback error={error} />
      {!canSave ? (
        <p className="notice">
          Se necesita una integración Gmail y un adapter disponible para guardar la fuente.
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            try {
              const response = await saveEmailSource(source?.id ?? null, form);
              if (response.ok) onSaved(response.data);
              else setError(response);
            } catch {
              setError({
                ok: false,
                error: 'No se pudo guardar. Actualiza la lista antes de volver a intentar.',
              });
            }
          });
        }}
      >
        <fieldset disabled={pending} className="email-fieldset">
          <div className="email-form-grid">
            <label>
              Nombre de la fuente
              <input
                name="displayName"
                autoComplete="off"
                required
                maxLength={160}
                defaultValue={source?.displayName}
                placeholder="Avisos de compras"
              />
            </label>
            <label>
              Dirección remitente
              <input
                name="senderAddress"
                type="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={320}
                defaultValue={source?.senderAddress}
                placeholder="avisos@institucion.example"
              />
              <small>Se compara la dirección completa, normalizada.</small>
            </label>
            <label>
              Institución
              <input
                name="institutionName"
                required
                maxLength={160}
                defaultValue={source?.institutionName}
                placeholder="Nombre de la institución"
              />
            </label>
            <label>
              Conexión Gmail
              <select
                name="integrationId"
                required
                defaultValue={source?.integrationId ?? gmailConnections[0]?.id ?? ''}
              >
                <option value="" disabled>
                  Selecciona una conexión
                </option>
                {gmailConnections.map((item, index) => (
                  <option key={item.id} value={item.id}>
                    Gmail {gmailConnections.length > 1 ? index + 1 : ''} · {item.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Adapter
              <select
                name="adapterKey"
                required
                defaultValue={source?.adapterKey ?? options.adapters[0]?.key ?? ''}
              >
                <option value="" disabled>
                  Selecciona un adapter
                </option>
                {options.adapters.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.displayName} · v{item.version}
                  </option>
                ))}
              </select>
              <small>La plantilla de correo debe ser compatible con este adapter.</small>
            </label>
            <label>
              Cuenta financiera (opcional)
              <select name="accountId" defaultValue={source?.accountId ?? ''}>
                <option value="">Sin cuenta asociada</option>
                {options.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.alias} · {account.currency}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Moneda predeterminada (opcional)
              <input
                name="defaultCurrency"
                pattern="[A-Za-z]{3}"
                maxLength={3}
                autoCapitalize="characters"
                defaultValue={source?.defaultCurrency ?? ''}
                placeholder="CRC"
              />
              <small>Se usa solo cuando el mensaje no identifica la moneda.</small>
            </label>
            <label>
              Estado
              <select name="status" defaultValue={source?.status ?? 'active'}>
                <option value="active">Activa</option>
                <option value="disabled">Desactivada</option>
              </select>
            </label>
          </div>
          <div className="email-checkbox-group">
            <label className="email-checkbox">
              <input
                type="checkbox"
                name="autoIngestionEnabled"
                defaultChecked={source?.autoIngestionEnabled ?? false}
              />
              <span>
                Ingestión automática
                <small>Analizar mensajes nuevos del remitente habilitado.</small>
              </span>
            </label>
            <label className="email-checkbox">
              <input
                type="checkbox"
                name="manualSyncEnabled"
                defaultChecked={source?.manualSyncEnabled ?? true}
              />
              <span>
                Sincronización manual
                <small>Permitir buscar y seleccionar correos desde el dashboard.</small>
              </span>
            </label>
          </div>
        </fieldset>
        <div className="email-actions">
          <button className="primary-button" type="submit" disabled={pending || !canSave}>
            <Save size={15} aria-hidden="true" />
            {pending ? 'Guardando…' : 'Guardar fuente'}
          </button>
          <button className="secondary-button" type="button" disabled={pending} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
