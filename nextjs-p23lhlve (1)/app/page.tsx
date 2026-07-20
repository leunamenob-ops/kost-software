'use client';

import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

type VistaTipo = 'grid' | 'lista';
type TipoFiltro = 'todos' | 'plato' | 'sub_receta';

export default function Home() {
  const [recetas, setRecetas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos');
  const [foodCostFiltro, setFoodCostFiltro] = useState<string[]>([]);
  const [margenFiltro, setMargenFiltro] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState('');
  
  // Vista y paginación
  const [vistaTipo, setVistaTipo] = useState<VistaTipo>('grid');
  const [paginaActual, setPaginaActual] = useState(1);
  const [ordenarPor, setOrdenarPor] = useState('nombre');
  const recetasPorPagina = 12;

  useEffect(() => {
    fetchRecetas();
  }, []);

  async function fetchRecetas() {
    try {
      const { data, error } = await supabase
        .from('recetas')
        .select(`
          *,
          receta_detalle!receta_detalle_receta_id_fkey (
            id,
            cantidad_necesaria,
            coste_linea,
            ingrediente_id,
            subreceta_id,
            ingredientes (
              nombre,
              precio_receta_real,
              unidad_receta
            ),
            subreceta:recetas!receta_detalle_subreceta_id_fkey (
              nombre,
              coste_total,
              tipo
            )
          )
        `)
        .order('nombre');

      if (error) {
        console.error('Error en la consulta:', error);
        throw error;
      }
      
      console.log('✅ Recetas cargadas:', data);
      setRecetas(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function eliminarReceta(id: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta receta?')) return;

    try {
      await supabase.from('receta_detalle').delete().eq('receta_id', id);
      await supabase.from('recetas').delete().eq('id', id);
      
      setRecetas(recetas.filter((r: any) => r.id !== id));
    } catch (error) {
      console.error('Error eliminando:', error);
    }
  }

  function calcularPrecioNeto(precioVenta: number, ivaPorcentaje: number = 10) {
    if (precioVenta <= 0) return 0;
    return precioVenta / (1 + ivaPorcentaje / 100);
  }

  function calcularFoodCost(costeTotal: number, precioVenta: number, ivaPorcentaje: number = 10) {
    const precioNeto = calcularPrecioNeto(precioVenta, ivaPorcentaje);
    if (precioNeto <= 0) return 0;
    return ((costeTotal / precioNeto) * 100).toFixed(2);
  }

  function calcularMargenNeto(costeTotal: number, precioVenta: number, ivaPorcentaje: number = 10) {
    const precioNeto = calcularPrecioNeto(precioVenta, ivaPorcentaje);
    if (precioNeto <= 0) return '0';
    return (((precioNeto - costeTotal) / precioNeto) * 100).toFixed(2);
  }

  function getFoodCostColorClass(foodCost: number) {
    if (foodCost < 25) return 'border-t-emerald-500 bg-emerald-50/50 text-emerald-900';
    if (foodCost <= 33) return 'border-t-amber-500 bg-amber-50/50 text-amber-900';
    return 'border-t-orange-500 bg-orange-50/50 text-orange-900';
  }

  function getFoodCostBadge(foodCost: number) {
    if (foodCost < 25) return '🟢';
    if (foodCost <= 33) return '🟡';
    return '🟠';
  }

  function getMargenColorClass(margen: number) {
    if (margen >= 60) return 'bg-emerald-50/70 text-emerald-900';
    if (margen >= 50) return 'bg-amber-50/70 text-amber-900';
    return 'bg-orange-50/70 text-orange-900';
  }

  function getMargenBadge(margen: number) {
    if (margen >= 60) return '🟢';
    if (margen >= 50) return '🟡';
    return '🟠';
  }

  // Filtrar recetas
  const recetasFiltradas = recetas.filter((receta: any) => {
    // Filtro por tipo
    if (tipoFiltro !== 'todos' && receta.tipo !== tipoFiltro) return false;
    
    // Filtro por búsqueda
    if (busqueda) {
      const busquedaLower = busqueda.toLowerCase();
      const coincideNombre = receta.nombre.toLowerCase().includes(busquedaLower);
      const coincideIngrediente = receta.receta_detalle?.some((d: any) => 
        d.ingredientes?.nombre.toLowerCase().includes(busquedaLower) ||
        d.subreceta?.nombre.toLowerCase().includes(busquedaLower)
      );
      if (!coincideNombre && !coincideIngrediente) return false;
    }
    
    // Filtro por Food Cost
    const foodCost = parseFloat(calcularFoodCost(receta.coste_total || 0, receta.precio_venta || 0));
    if (foodCostFiltro.length > 0) {
      let coincideFC = false;
      if (foodCostFiltro.includes('<25') && foodCost < 25) coincideFC = true;
      if (foodCostFiltro.includes('25-33') && foodCost >= 25 && foodCost <= 33) coincideFC = true;
      if (foodCostFiltro.includes('>33') && foodCost > 33) coincideFC = true;
      if (!coincideFC) return false;
    }
    
    // Filtro por Margen
    const margen = parseFloat(calcularMargenNeto(receta.coste_total || 0, receta.precio_venta || 0));
    if (margenFiltro.length > 0) {
      let coincideMargen = false;
      if (margenFiltro.includes('>=60') && margen >= 60) coincideMargen = true;
      if (margenFiltro.includes('50-60') && margen >= 50 && margen < 60) coincideMargen = true;
      if (margenFiltro.includes('<50') && margen < 50) coincideMargen = true;
      if (!coincideMargen) return false;
    }
    
    return true;
  });

  // Ordenar recetas
  const recetasOrdenadas = [...recetasFiltradas].sort((a: any, b: any) => {
    switch (ordenarPor) {
      case 'nombre':
        return a.nombre.localeCompare(b.nombre);
      case 'precio_mayor':
        return (b.precio_venta || 0) - (a.precio_venta || 0);
      case 'precio_menor':
        return (a.precio_venta || 0) - (b.precio_venta || 0);
      case 'foodcost_menor':
        return parseFloat(calcularFoodCost(a.coste_total || 0, a.precio_venta || 0)) - 
               parseFloat(calcularFoodCost(b.coste_total || 0, b.precio_venta || 0));
      case 'margen_mayor':
        return parseFloat(calcularMargenNeto(a.coste_total || 0, a.precio_venta || 0)) - 
               parseFloat(calcularMargenNeto(b.coste_total || 0, b.precio_venta || 0));
      default:
        return 0;
    }
  });

  // Paginación
  const totalPaginas = Math.ceil(recetasOrdenadas.length / recetasPorPagina);
  const inicio = (paginaActual - 1) * recetasPorPagina;
  const fin = inicio + recetasPorPagina;
  const recetasPagina = recetasOrdenadas.slice(inicio, fin);

  function resetearFiltros() {
    setTipoFiltro('todos');
    setFoodCostFiltro([]);
    setMargenFiltro([]);
    setBusqueda('');
    setPaginaActual(1);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🌊</div>
          <div className="text-xl text-cyan-900 font-semibold">Cargando recetas...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyan-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg">
        <div className="px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">🍽️ Restaurant Manager</h1>
              <p className="text-cyan-100 mt-1">Gestión inteligente de costes y recetas</p>
            </div>
            <a
              href="/recetas/nueva"
              className="px-6 py-3 bg-white text-cyan-600 rounded-lg hover:bg-cyan-50 font-semibold shadow-md transition-all hover:shadow-lg"
            >
              ➕ Nueva Receta
            </a>
          </div>
        </div>
      </header>

      {/* Barra de búsqueda y controles */}
      <div className="bg-white border-b border-cyan-200 px-8 py-4">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setPaginaActual(1);
                }}
                placeholder="🔍 Buscar recetas, ingredientes..."
                className="w-full pl-4 pr-4 py-2 border border-cyan-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <select
            value={ordenarPor}
            onChange={(e) => setOrdenarPor(e.target.value)}
            className="px-4 py-2 border border-cyan-200 rounded-lg focus:ring-2 focus:ring-cyan-500 bg-white"
          >
            <option value="nombre"> Nombre</option>
            <option value="precio_mayor">💰 Precio (mayor)</option>
            <option value="precio_menor">💰 Precio (menor)</option>
            <option value="foodcost_menor">📊 Food Cost (menor)</option>
            <option value="margen_mayor">💚 Margen (mayor)</option>
          </select>

          <div className="flex gap-2 border border-cyan-200 rounded-lg p-1">
            <button
              onClick={() => setVistaTipo('grid')}
              className={`px-3 py-1 rounded ${
                vistaTipo === 'grid' 
                  ? 'bg-cyan-600 text-white' 
                  : 'text-cyan-700 hover:bg-cyan-100'
              }`}
            >
              ⊞ Grid
            </button>
            <button
              onClick={() => setVistaTipo('lista')}
              className={`px-3 py-1 rounded ${
                vistaTipo === 'lista' 
                  ? 'bg-cyan-600 text-white' 
                  : 'text-cyan-700 hover:bg-cyan-100'
              }`}
            >
              ☰ Lista
            </button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar - Filtros */}
        <aside className="w-72 bg-white border-r border-cyan-200 p-6 min-h-[calc(100vh-200px)]">
          <h2 className="text-lg font-bold text-gray-800 mb-4 border-b-2 border-cyan-600 pb-2">
            🔍 Filtros
          </h2>

          {/* Tipo de receta */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">📂 Tipo</h3>
            <div className="space-y-2">
              <label className="flex items-center cursor-pointer hover:bg-cyan-50 p-2 rounded">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipoFiltro === 'todos'}
                  onChange={() => {
                    setTipoFiltro('todos');
                    setPaginaActual(1);
                  }}
                  className="w-4 h-4 text-cyan-600"
                />
                <span className="ml-2 text-gray-700">Todos</span>
              </label>
              <label className="flex items-center cursor-pointer hover:bg-cyan-50 p-2 rounded">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipoFiltro === 'plato'}
                  onChange={() => {
                    setTipoFiltro('plato');
                    setPaginaActual(1);
                  }}
                  className="w-4 h-4 text-cyan-600"
                />
                <span className="ml-2 text-gray-700">🍽️ Platos</span>
              </label>
              <label className="flex items-center cursor-pointer hover:bg-cyan-50 p-2 rounded">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipoFiltro === 'sub_receta'}
                  onChange={() => {
                    setTipoFiltro('sub_receta');
                    setPaginaActual(1);
                  }}
                  className="w-4 h-4 text-cyan-600"
                />
                <span className="ml-2 text-gray-700">🥘 Sub-recetas</span>
              </label>
            </div>
          </div>

          {/* Food Cost */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">📊 Food Cost</h3>
            <div className="space-y-2">
              {[
                { value: '<25', label: '<25% (Óptimo)', emoji: '🟢' },
                { value: '25-33', label: '25-33% (Aceptable)', emoji: '' },
                { value: '>33', label: '>33% (Alto)', emoji: '🟠' }
              ].map((opcion) => (
                <label key={opcion.value} className="flex items-center cursor-pointer hover:bg-cyan-50 p-2 rounded">
                  <input
                    type="checkbox"
                    checked={foodCostFiltro.includes(opcion.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFoodCostFiltro([...foodCostFiltro, opcion.value]);
                      } else {
                        setFoodCostFiltro(foodCostFiltro.filter(f => f !== opcion.value));
                      }
                      setPaginaActual(1);
                    }}
                    className="w-4 h-4 text-cyan-600 rounded"
                  />
                  <span className="ml-2 text-gray-700">{opcion.emoji} {opcion.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Margen Neto */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">💚 Margen Neto</h3>
            <div className="space-y-2">
              {[
                { value: '>=60', label: '≥60% (Excelente)', emoji: '🟢' },
                { value: '50-60', label: '50-60% (Bueno)', emoji: '' },
                { value: '<50', label: '<50% (Bajo)', emoji: '🟠' }
              ].map((opcion) => (
                <label key={opcion.value} className="flex items-center cursor-pointer hover:bg-cyan-50 p-2 rounded">
                  <input
                    type="checkbox"
                    checked={margenFiltro.includes(opcion.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setMargenFiltro([...margenFiltro, opcion.value]);
                      } else {
                        setMargenFiltro(margenFiltro.filter(f => f !== opcion.value));
                      }
                      setPaginaActual(1);
                    }}
                    className="w-4 h-4 text-cyan-600 rounded"
                  />
                  <span className="ml-2 text-gray-700">{opcion.emoji} {opcion.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Botón Reset */}
          <button
            onClick={resetearFiltros}
            className="w-full py-2 border-2 border-cyan-600 text-cyan-600 rounded-lg hover:bg-cyan-50 font-semibold transition-colors"
          >
            🔄 Limpiar filtros
          </button>
        </aside>

        {/* Contenido principal */}
        <main className="flex-1 p-8">
          {/* Estadísticas */}
          <div className="mb-6 flex justify-between items-center">
            <p className="text-gray-600">
              Mostrando <span className="font-semibold text-cyan-900">{recetasPagina.length}</span> de{' '}
              <span className="font-semibold text-cyan-900">{recetasOrdenadas.length}</span> recetas
              {recetasFiltradas.length !== recetas.length && (
                <span className="text-cyan-600"> (filtradas de {recetas.length} totales)</span>
              )}
            </p>
          </div>

          {/* Grid de recetas */}
          {vistaTipo === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {recetasPagina.map((receta: any) => {
                const foodCost = parseFloat(calcularFoodCost(receta.coste_total || 0, receta.precio_venta || 0));
                const margenNeto = parseFloat(calcularMargenNeto(receta.coste_total || 0, receta.precio_venta || 0));
                const precioNeto = calcularPrecioNeto(receta.precio_venta || 0);

                return (
                  <div
                    key={receta.id}
                    className={`bg-white rounded-lg shadow-sm hover:shadow-md transition-all hover:-translate-y-1 border-t-4 ${getFoodCostColorClass(foodCost)}`}
                  >
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 text-lg leading-tight mb-1">
                            {receta.nombre}
                          </h3>
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            receta.tipo === 'plato' 
                              ? 'bg-cyan-100 text-cyan-800' 
                              : 'bg-teal-100 text-teal-800'
                          }`}>
                            {receta.tipo === 'plato' ? '🍽️ Plato' : '🥘 Sub-receta'}
                          </span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <p className="text-2xl font-bold text-cyan-900">
                          {receta.precio_venta > 0 ? `${receta.precio_venta.toFixed(2)}€` : 'Sin precio'}
                        </p>
                        {receta.precio_venta > 0 && (
                          <p className="text-xs text-gray-500">
                            Neto: {precioNeto.toFixed(2)}€
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className={`p-2 rounded ${getFoodCostColorClass(foodCost)}`}>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">📊 Food Cost</span>
                            <span className="font-bold">{foodCost}% {getFoodCostBadge(foodCost)}</span>
                          </div>
                        </div>
                        
                        <div className={`p-2 rounded ${getMargenColorClass(margenNeto)}`}>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">💚 Margen</span>
                            <span className="font-bold">{margenNeto}% {getMargenBadge(margenNeto)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-3 border-t border-gray-200">
                        <a
                          href={`/recetas/${receta.id}/editar`}
                          className="flex-1 px-3 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 text-sm font-medium transition-colors text-center"
                        >
                          ✏️ Editar
                        </a>
                        <button
                          onClick={() => eliminarReceta(receta.id)}
                          className="px-3 py-2 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 text-sm font-medium transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Vista de lista */
            <div className="space-y-4">
              {recetasPagina.map((receta: any) => {
                const foodCost = parseFloat(calcularFoodCost(receta.coste_total || 0, receta.precio_venta || 0));
                const margenNeto = parseFloat(calcularMargenNeto(receta.coste_total || 0, receta.precio_venta || 0));
                const precioNeto = calcularPrecioNeto(receta.precio_venta || 0);

                return (
                  <div
                    key={receta.id}
                    className={`bg-white rounded-lg shadow-sm hover:shadow-md transition-all border-t-4 ${getFoodCostColorClass(foodCost)} p-5`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-bold text-gray-900 text-xl">
                            {receta.nombre}
                          </h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            receta.tipo === 'plato' 
                              ? 'bg-cyan-100 text-cyan-800' 
                              : 'bg-teal-100 text-teal-800'
                          }`}>
                            {receta.tipo === 'plato' ? '🍽️ Plato' : '🥘 Sub-receta'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                          <div>
                            <p className="text-sm text-gray-500">Precio</p>
                            <p className="font-bold text-cyan-900">
                              {receta.precio_venta > 0 ? `${receta.precio_venta.toFixed(2)}€` : '-'}
                            </p>
                            <p className="text-xs text-gray-400">Neto: {precioNeto.toFixed(2)}€</p>
                          </div>
                          
                          <div>
                            <p className="text-sm text-gray-500">Food Cost</p>
                            <p className={`font-bold ${foodCost < 25 ? 'text-emerald-700' : foodCost <= 33 ? 'text-amber-700' : 'text-orange-700'}`}>
                              {foodCost}% {getFoodCostBadge(foodCost)}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-sm text-gray-500">Margen Neto</p>
                            <p className={`font-bold ${margenNeto >= 60 ? 'text-emerald-700' : margenNeto >= 50 ? 'text-amber-700' : 'text-orange-700'}`}>
                              {margenNeto}% {getMargenBadge(margenNeto)}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-sm text-gray-500">Porciones</p>
                            <p className="font-bold text-gray-900">{receta.porciones}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        <a
                          href={`/recetas/${receta.id}/editar`}
                          className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 font-medium transition-colors"
                        >
                          ✏️ Editar
                        </a>
                        <button
                          onClick={() => eliminarReceta(receta.id)}
                          className="px-4 py-2 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 font-medium transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sin resultados */}
          {recetasPagina.length === 0 && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-xl text-gray-600 mb-2">No se encontraron recetas</p>
              <p className="text-gray-500">Prueba a ajustar los filtros o la búsqueda</p>
            </div>
          )}

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="mt-8 flex justify-center items-center gap-2">
              <button
                onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="px-4 py-2 border-2 border-cyan-600 text-cyan-600 rounded-lg hover:bg-cyan-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                ← Anterior
              </button>
              
              <div className="flex gap-1">
                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((pagina) => (
                  <button
                    key={pagina}
                    onClick={() => setPaginaActual(pagina)}
                    className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                      pagina === paginaActual
                        ? 'bg-cyan-600 text-white'
                        : 'text-cyan-700 hover:bg-cyan-100'
                    }`}
                  >
                    {pagina}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
                className="px-4 py-2 border-2 border-cyan-600 text-cyan-600 rounded-lg hover:bg-cyan-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Siguiente →
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
