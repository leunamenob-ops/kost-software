'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

interface Ingrediente {
  id: string;
  nombre: string;
  unidad_receta: string;
  precio_receta_real: number;
}

interface SubReceta {
  id: string;
  nombre: string;
  coste_total: number;
  produccion_gramos: number | null;
  tipo: string;
}

interface ItemSeleccionado {
  tipo: 'ingrediente' | 'subreceta';
  id: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  costeUnitario: number;
  coste: number;
}

export default function NuevaReceta() {
  const router = useRouter();
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [subRecetas, setSubRecetas] = useState<SubReceta[]>([]);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'plato' | 'sub_receta'>('plato');
  const [porciones, setPorciones] = useState(1);
  const [produccionGramos, setProduccionGramos] = useState<number | ''>('');
  const [precioVenta, setPrecioVenta] = useState(0);
  const [ivaPorcentaje, setIvaPorcentaje] = useState(10);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<ItemSeleccionado[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [itemSeleccionado, setItemSeleccionado] = useState<{tipo: 'ingrediente' | 'subreceta', id: string} | null>(null);
  const [cantidadActual, setCantidadActual] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    const { data: ingredientesData } = await supabase
      .from('ingredientes')
      .select('id, nombre, unidad_receta, precio_receta_real')
      .order('nombre');
    
    if (ingredientesData) setIngredientes(ingredientesData);

    const { data: subRecetasData } = await supabase
      .from('recetas')
      .select('id, nombre, coste_total, produccion_gramos, tipo')
      .eq('tipo', 'sub_receta')
      .order('nombre');
    
    if (subRecetasData) setSubRecetas(subRecetasData);
  }

  const todosLosItems = [
    ...ingredientes.map(i => ({
      tipo: 'ingrediente' as const,
      id: i.id,
      nombre: i.nombre,
      costeUnitario: i.precio_receta_real,
      unidad: i.unidad_receta
    })),
    ...subRecetas.map(s => {
      const costePorGramo = s.produccion_gramos && s.produccion_gramos > 0 
        ? s.coste_total / s.produccion_gramos 
        : 0;
      return {
        tipo: 'subreceta' as const,
        id: s.id,
        nombre: s.nombre,
        costeUnitario: costePorGramo,
        unidad: 'g'
      };
    })
  ];

  const itemsFiltrados = todosLosItems.filter(item =>
    item.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  function agregarItem() {
    if (!itemSeleccionado || cantidadActual <= 0) {
      setMensaje('️ Selecciona un elemento y una cantidad válida');
      return;
    }

    const item = todosLosItems.find(i => i.id === itemSeleccionado.id && i.tipo === itemSeleccionado.tipo);
    if (!item) return;

    const coste = cantidadActual * item.costeUnitario;

    setItemsSeleccionados([
      ...itemsSeleccionados,
      {
        tipo: item.tipo,
        id: item.id,
        nombre: item.nombre,
        cantidad: cantidadActual,
        unidad: item.unidad,
        costeUnitario: item.costeUnitario,
        coste,
      },
    ]);

    setItemSeleccionado(null);
    setCantidadActual(0);
    setMensaje('');
  }

  function eliminarItem(index: number) {
    setItemsSeleccionados(itemsSeleccionados.filter((_, i) => i !== index));
  }

  function calcularCosteTotal() {
    return itemsSeleccionados.reduce((sum, item) => sum + item.coste, 0);
  }

  function calcularPrecioNeto() {
    if (precioVenta <= 0) return 0;
    return precioVenta / (1 + ivaPorcentaje / 100);
  }

  function calcularFoodCostPorcentaje() {
    const coste = calcularCosteTotal();
    const precioNeto = calcularPrecioNeto();
    if (precioNeto <= 0) return '0';
    return ((coste / precioNeto) * 100).toFixed(2);
  }

  function calcularMargenNeto() {
    const coste = calcularCosteTotal();
    const precioNeto = calcularPrecioNeto();
    if (precioNeto <= 0) return '0';
    return (((precioNeto - coste) / precioNeto) * 100).toFixed(2);
  }

  function calcularCostePorGramo() {
    const coste = calcularCosteTotal();
    const gramos = typeof produccionGramos === 'number' && produccionGramos > 0 ? produccionGramos : 0;
    if (gramos === 0) return 0;
    return coste / gramos;
  }

  async function guardarReceta() {
    if (!nombre.trim()) {
      setMensaje('️ El nombre es obligatorio');
      return;
    }

    if (itemsSeleccionados.length === 0) {
      setMensaje('️ Añade al menos un ingrediente o sub-receta');
      return;
    }

    if (tipo === 'sub_receta' && (!produccionGramos || produccionGramos <= 0)) {
      setMensaje('⚠️ Para sub-recetas, debes especificar la producción en gramos');
      return;
    }

    setGuardando(true);
    setMensaje('');

    try {
      const { data: recetaData, error: recetaError } = await supabase
        .from('recetas')
        .insert({
          nombre: nombre.trim(),
          tipo,
          porciones,
          produccion_gramos: tipo === 'sub_receta' ? produccionGramos : null,
          precio_venta: precioVenta,
          coste_total: calcularCosteTotal(),
        })
        .select()
        .single();

      if (recetaError) throw recetaError;

      const detalles = itemsSeleccionados.map((item) => ({
        receta_id: recetaData.id,
        ingrediente_id: item.tipo === 'ingrediente' ? item.id : null,
        subreceta_id: item.tipo === 'subreceta' ? item.id : null,
        cantidad_necesaria: item.cantidad,
        coste_linea: item.coste,
      }));

      const { error: detalleError } = await supabase
        .from('receta_detalle')
        .insert(detalles);

      if (detalleError) throw detalleError;

      setMensaje('✅ Receta guardada correctamente');

      setTimeout(() => {
        router.push('/');
      }, 1500);

    } catch (error: any) {
      setMensaje(`❌ Error: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Nueva Receta</h1>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            ← Volver al listado
          </button>
        </div>

        {mensaje && (
          <div className={`mb-6 p-4 rounded-lg ${
            mensaje.includes('✅') ? 'bg-green-100 text-green-800' :
            mensaje.includes('⚠️') ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {mensaje}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">📋 Datos básicos</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de la receta *
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: Solomillo al whisky"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo *
              </label>
              <select
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as 'plato' | 'sub_receta');
                  if (e.target.value === 'plato') {
                    setProduccionGramos('');
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="plato">🍽️ Plato Principal</option>
                <option value="sub_receta">🥘 Sub-receta</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Porciones
              </label>
              <input
                type="number"
                value={porciones}
                onChange={(e) => setPorciones(Number(e.target.value))}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {tipo === 'sub_receta' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Producción total (gramos) *
                </label>
                <input
                  type="number"
                  value={produccionGramos}
                  onChange={(e) => setProduccionGramos(Number(e.target.value))}
                  min="1"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: 1000"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ¿Cuántos gramos produces de esta sub-receta?
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio de venta (€) - INCLUIDO IVA
              </label>
              <input
                type="number"
                value={precioVenta}
                onChange={(e) => setPrecioVenta(Number(e.target.value))}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                IVA (%)
              </label>
              <select
                value={ivaPorcentaje}
                onChange={(e) => setIvaPorcentaje(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="4">4% - Superreducido</option>
                <option value="10">10% - Reducido (Restauración)</option>
                <option value="21">21% - General</option>
                <option value="0">0% - Sin IVA</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🥬 Añadir ingredientes o sub-recetas</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar ingrediente o sub-receta
            </label>
            <div className="relative">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (itemsFiltrados.length > 0 && !itemSeleccionado) {
                      setItemSeleccionado({
                        tipo: itemsFiltrados[0].tipo,
                        id: itemsFiltrados[0].id
                      });
                    }
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Escribe para buscar... (ej: pollo, salsa, patatas)"
              />
              {busqueda && (
                <button
                  onClick={() => {
                    setBusqueda('');
                    setItemSeleccionado(null);
                  }}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>

            {busqueda && itemsFiltrados.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded-lg bg-white max-h-60 overflow-y-auto shadow-lg z-10 relative">
                {itemsFiltrados.map((item) => (
                  <button
                    key={`${item.tipo}-${item.id}`}
                    onClick={() => {
                      setItemSeleccionado({tipo: item.tipo, id: item.id});
                      setCantidadActual(0);
                      setBusqueda('');
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 flex justify-between items-center"
                  >
                    <div>
                      <span className="font-medium text-gray-900">{item.nombre}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {item.tipo === 'subreceta' ? '🥘 Sub-receta' : `📦 ${item.unidad}`}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {item.costeUnitario.toFixed(6)}€/{item.unidad}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {busqueda && itemsFiltrados.length === 0 && (
              <div className="mt-2 p-3 text-gray-500 bg-gray-50 rounded-lg text-center">
                No se encontraron ingredientes o sub-recetas
              </div>
            )}
          </div>

          {itemSeleccionado && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cantidad ({itemSeleccionado && todosLosItems.find(i => i.id === itemSeleccionado.id && i.tipo === itemSeleccionado.tipo)?.unidad})
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={cantidadActual}
                  onChange={(e) => setCantidadActual(Number(e.target.value))}
                  min="0"
                  step="0.01"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={itemSeleccionado.tipo === 'subreceta' ? "Ej: 80" : "Ej: 200"}
                  autoFocus
                />
                <button
                  onClick={agregarItem}
                  disabled={cantidadActual <= 0}
                  className={`px-6 py-2 rounded-lg font-semibold ${
                    cantidadActual > 0
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  + Añadir
                </button>
              </div>
              {itemSeleccionado && (
                <p className="mt-2 text-sm text-gray-600">
                  Seleccionado: <span className="font-semibold">
                    {todosLosItems.find(i => i.id === itemSeleccionado.id && i.tipo === itemSeleccionado.tipo)?.nombre}
                  </span>
                  {itemSeleccionado.tipo === 'subreceta' && ' (coste por gramo)'}
                </p>
              )}
            </div>
          )}

          {itemsSeleccionados.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-700 mb-3">
                Elementos añadidos:
              </h3>
              <ul className="space-y-2">
                {itemsSeleccionados.map((item, index) => (
                  <li key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                    <div>
                      <span className="text-gray-800 font-medium">{item.nombre}</span>
                      {item.tipo === 'subreceta' && (
                        <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                          Sub-receta
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-gray-600">
                        {item.cantidad} {item.unidad} × {item.costeUnitario.toFixed(4)}€ = {item.coste.toFixed(4)}€
                      </span>
                      <button
                        onClick={() => eliminarItem(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        🗑️
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">💰 Resumen de costes</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg border-2 border-gray-200">
              <p className="text-sm text-gray-600">Precio de venta (IVA {ivaPorcentaje}%)</p>
              <p className="text-2xl font-bold text-gray-900">
                {precioVenta.toFixed(2)}€
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Precio neto: {calcularPrecioNeto().toFixed(2)}€
              </p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-600">Coste total</p>
              <p className="text-2xl font-bold text-blue-900">
                {calcularCosteTotal().toFixed(2)}€
              </p>
            </div>

            {tipo === 'sub_receta' && typeof produccionGramos === 'number' && produccionGramos > 0 && (
              <div className="bg-orange-50 p-4 rounded-lg border-2 border-orange-200">
                <p className="text-sm text-orange-600">Coste por gramo</p>
                <p className="text-2xl font-bold text-orange-900">
                  {calcularCostePorGramo().toFixed(6)}€
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Producción: {produccionGramos}g
                </p>
              </div>
            )}

            <div className={`${
              parseFloat(calcularFoodCostPorcentaje()) < 25 
                ? 'bg-green-50' 
                : parseFloat(calcularFoodCostPorcentaje()) <= 33 
                ? 'bg-yellow-50' 
                : 'bg-red-50'
            } p-4 rounded-lg`}>
              <p className={`text-sm ${
                parseFloat(calcularFoodCostPorcentaje()) < 25 
                  ? 'text-green-600' 
                  : parseFloat(calcularFoodCostPorcentaje()) <= 33 
                  ? 'text-yellow-600' 
                  : 'text-red-600'
              }`}>
                📊 Food Cost
              </p>
              <p className={`text-2xl font-bold ${
                parseFloat(calcularFoodCostPorcentaje()) < 25 
                  ? 'text-green-900' 
                  : parseFloat(calcularFoodCostPorcentaje()) <= 33 
                  ? 'text-yellow-900' 
                  : 'text-red-900'
              }`}>
                {calcularFoodCostPorcentaje()}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Ideal: &lt;25%
              </p>
            </div>

            <div className={`${
              parseFloat(calcularMargenNeto()) >= 60 
                ? 'bg-green-50' 
                : parseFloat(calcularMargenNeto()) >= 50 
                ? 'bg-yellow-50' 
                : 'bg-red-50'
            } p-4 rounded-lg`}>
              <p className={`text-sm ${
                parseFloat(calcularMargenNeto()) >= 60 
                  ? 'text-green-600' 
                  : parseFloat(calcularMargenNeto()) >= 50 
                  ? 'text-yellow-600' 
                  : 'text-red-600'
              }`}>
                 Margen Neto
              </p>
              <p className={`text-2xl font-bold ${
                parseFloat(calcularMargenNeto()) >= 60 
                  ? 'text-green-900' 
                  : parseFloat(calcularMargenNeto()) >= 50 
                  ? 'text-yellow-900' 
                  : 'text-red-900'
              }`}>
                {calcularMargenNeto()}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Sobre neto (sin IVA)
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={guardarReceta}
          disabled={guardando}
          className={`w-full py-4 rounded-lg text-white font-semibold text-lg ${
            guardando ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {guardando ? '💾 Guardando...' : '💾 Guardar receta'}
        </button>
      </div>
    </div>
  );
}