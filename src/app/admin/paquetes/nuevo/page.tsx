import { NewPackageForm } from '@/components/NewPackageForm';

export const dynamic = 'force-dynamic';

export default function NuevoPaquetePage() {
  return (
    <>
      <div className="admin-header">
        <div>
          <div className="tag">Publicación</div>
          <h2 style={{ fontSize: 30 }}>Nuevo paquete</h2>
          <p>
            Una fecha cerrada que se pauta en redes. Una vez publicado, el cron diario chequea su
            tarifa real contra la aerolínea y avisa cuando se movió lo suficiente como para que el
            precio de la pieza deje de cerrar.
          </p>
        </div>
      </div>

      <NewPackageForm />
    </>
  );
}
